import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { ObjectId } from "mongodb";
import * as config from "../lib/newsletterConfig.js";
import * as workflow from "../lib/newsletterWorkflow.mjs";
import * as activity from "../lib/emailActivity.js";
import * as unsubscribe from "../lib/unsubscribe.js";
import * as links from "../lib/emailTemplates/_trackingLinks.mjs";
import * as baseUrl from "../lib/emailBaseUrl.mjs";
import * as cancellation from "../lib/cancelScheduledNewsletters.js";
import template from "../lib/emailTemplates/november2026Newsletter.js";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
function loadDelivery() {
  const source = readFileSync(new URL("../lib/newsletterDelivery.js", import.meta.url), "utf8");
  const { code } = transformSync(source, { filename: "newsletterDelivery.js", jsc: { target: "es2022", parser: { syntax: "ecmascript" } }, module: { type: "commonjs" } });
  const overrides = {
    "./newsletterConfig.js": config, "./newsletterWorkflow.mjs": workflow,
    "./emailActivity.js": activity, "./unsubscribe.js": unsubscribe, "./emailTemplates/_trackingLinks.mjs": links,
    "./emailBaseUrl.mjs": baseUrl, "./cancelScheduledNewsletters.js": cancellation,
    "./emailTemplates/index.js": { getEmailTemplate: (id) => id === template.id ? template : null },
  };
  const exports = {};
  runInNewContext(code, { exports, Buffer, Date, setTimeout, console,
    require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : require(name) });
  return exports;
}
const { prepareNewsletter, processNewsletter } = loadDelivery();
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const copy = (value) => value instanceof ObjectId || value instanceof Date ? value : Array.isArray(value) ? value.map(copy) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)])) : value;
const eq = (a, b) => a instanceof ObjectId || b instanceof ObjectId ? String(a) === String(b) : a === b;
function get(object, parts) {
  if (!parts.length) return object;
  if (Array.isArray(object) && !/^\d+$/.test(parts[0])) return object.flatMap((value) => get(value, parts));
  return get(object?.[parts[0]], parts.slice(1));
}
function matches(row, query) {
  return Object.entries(query).every(([key, condition]) => {
    if (key === "$or") return condition.some((value) => matches(row, value));
    const value = get(row, key.split("."));
    if (condition && typeof condition === "object" && !(condition instanceof ObjectId) && !(condition instanceof Date)) {
      return Object.entries(condition).every(([op, expected]) => {
        if (op === "$exists") return expected === (value !== undefined);
        if (op === "$lt") return value < expected;
        if (op === "$ne") return !eq(value, expected);
        if (op === "$in") return expected.some((item) => eq(value, item));
        throw new Error(`Unsupported operator ${op}`);
      });
    }
    return Array.isArray(value) ? value.some((v) => eq(v, condition)) : eq(value, condition) || (condition === null && value === undefined);
  });
}
function set(object, path, value) {
  const parts = path.split(".");
  const key = parts.pop();
  let at = object;
  for (const part of parts) at = at[part] ||= {};
  if (value === undefined) delete at[key]; else at[key] = copy(value);
}
function database(contacts = []) {
  const tables = new Map([["contacts", contacts.map(copy)]]);
  const db = { tables, failReceiptOnce: false, collection(name) {
    const rows = tables.get(name) || [];
    tables.set(name, rows);
    const update = (row, updates, inserted = false) => {
      for (const [path, value] of Object.entries(updates.$set || {})) set(row, path, value);
      for (const path of Object.keys(updates.$unset || {})) set(row, path, undefined);
      for (const [path, value] of Object.entries(updates.$inc || {})) set(row, path, (get(row, path.split(".")) || 0) + value);
      if (inserted) Object.assign(row, copy(updates.$setOnInsert || {}));
    };
    return {
      async createIndex() {},
      find: (query = {}) => ({ toArray: async () => rows.filter((r) => matches(r, query)).map(copy) }),
      findOne: async (query) => copy(rows.find((r) => matches(r, query))) || null,
      async insertOne(row) {
        if (rows.some((r) => eq(r._id, row._id))) throw Object.assign(new Error("duplicate"), { code: 11000 });
        rows.push(copy(row)); return { insertedId: row._id };
      },
      async updateOne(query, updates, options = {}) {
        if (name === "contactEmails" && db.failReceiptOnce && updates.$set?.resendEmailId) {
          db.failReceiptOnce = false; throw new Error("database receipt write failed");
        }
        let row = rows.find((r) => matches(r, query));
        if (!row && options.upsert) { row = { _id: query._id }; rows.push(row); update(row, updates, true); return { upsertedCount: 1, modifiedCount: 1 }; }
        if (!row) return { modifiedCount: 0, matchedCount: 0 };
        update(row, updates); return { modifiedCount: 1, matchedCount: 1 };
      },
      async findOneAndUpdate(query, updates) {
        const row = rows.find((r) => matches(r, query));
        if (!row) return null;
        update(row, updates); return copy(row);
      },
    };
  } };
  return db;
}
function contact(index = 0, extra = {}) {
  return { _id: new ObjectId(index.toString(16).padStart(24, "0")), firstName: `Person ${index}`, email: `person${index}@example.com`, emailStatus: "subscribed", trackingId: "NE-7K4P9X2Q", ...extra };
}
function body(contacts) {
  const reviewed = workflow.reviewNewsletterRecipients(contacts);
  return { requestId: randomUUID(), templateId: template.id, subject: template.subject, fromEmail: "nick@nicholasegner.com",
    contactIds: reviewed.filter((r) => r.eligible).map((r) => r.id), revision: hash(reviewed), timeZone: "America/Chicago", localTime: "" };
}
function provider() {
  const cache = new Map();
  const p = { calls: [], deliveries: 0, loseOnce: false, rejectAt: 0, omitReceipt: false,
    batch: { send: (messages, options) => send(messages, options, false) },
    emails: { send: (message, options) => send([message], options, true), cancel: async () => ({ data: {} }) },
  };
  async function send(messages, options, single) {
    p.calls.push({ messages: copy(messages), options });
    if (cache.has(options.idempotencyKey)) {
      const prior = cache.get(options.idempotencyKey); assert.equal(JSON.stringify(messages), prior.payload); return prior.result;
    }
    if (p.rejectAt === p.calls.length) return { error: { statusCode: 422, message: "Rejected by provider" } };
    if (p.omitReceipt) return { data: { data: [] } };
    p.deliveries += messages.length;
    const ids = messages.map(() => ({ id: randomUUID() }));
    const result = { data: single ? ids[0] : { data: ids } };
    cache.set(options.idempotencyKey, { payload: JSON.stringify(messages), result });
    if (p.loseOnce) { p.loseOnce = false; throw new Error("lost provider response"); }
    return result;
  }
  return p;
}
process.env.RESEND_API_KEY = "test-only-no-live-email";
process.env.UNSUBSCRIBE_SECRET = "test-only-no-live-email";
const step = async (db, id, p, extra = {}) => processNewsletter(db, id, p, { pause: async () => {}, ...extra });

test("sender defaults work without RESEND_FROM_EMAIL and missing secrets are actionable", () => {
  delete process.env.RESEND_FROM_EMAIL;
  assert.equal(config.getNewsletterConfigStatus().configured, true);
  assert.equal(config.getNewsletterConfigStatus().fromEmail, "nick@nicholasegner.com");
  delete process.env.RESEND_API_KEY;
  assert.match(config.getNewsletterConfigStatus().setupIssues.join(" "), /RESEND_API_KEY/);
  process.env.RESEND_API_KEY = "test-only-no-live-email";
});

test("review removes duplicate addresses, invalid addresses, unknowns, and opted-out duplicate records", () => {
  const contacts = [contact(1), contact(2, { email: " PERSON1@EXAMPLE.COM " }), contact(3, { emailStatus: "unknown" }),
    contact(4, { email: "invalid" }), contact(5, { emailStatus: "unsubscribed" }), contact(6, { email: "person5@example.com" })];
  const reviewed = workflow.reviewNewsletterRecipients(contacts);
  assert.equal(reviewed.filter((r) => r.eligible).length, 1);
  assert.match(reviewed[1].reason, /Duplicate/);
  assert.match(reviewed[5].reason, /opted out/);
});

test("schedules use the chosen zone, reject DST gaps/repeats, and enforce provider horizon", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  assert.equal(workflow.newsletterSchedule("2026-11-26T09:00", "America/Chicago", now), "2026-11-26T15:00:00.000Z");
  assert.equal(workflow.newsletterSchedule("2026-11-26T09:00", "America/Phoenix", now), "2026-11-26T16:00:00.000Z");
  assert.throws(() => workflow.newsletterSchedule("2027-03-14T02:30", "America/Chicago", Date.parse("2027-03-01T12:00:00Z")), /skipped or repeated/);
  assert.throws(() => workflow.newsletterSchedule("2026-11-01T01:30", "America/Chicago", Date.parse("2026-10-20T12:00:00Z")), /skipped or repeated/);
  assert.throws(() => workflow.newsletterSchedule("2026-11-17T06:01", "America/Chicago", now), /10 minutes/);
  assert.throws(() => workflow.newsletterSchedule("2026-12-26T09:00", "America/Chicago", now), /30 days/);
});

test("missing attribution and changed recipient reviews fail before any send record is created", async () => {
  const contacts = [contact(1, { trackingId: "" })];
  const db = database(contacts);
  await assert.rejects(prepareNewsletter(db, body(contacts)), /tracking IDs/);
  assert.equal(db.tables.get("newsletterSends").length, 0);
  const changed = body([contact(1)]);
  await assert.rejects(prepareNewsletter(db, changed), /contact list changed/);
  assert.equal(db.tables.get("newsletterSends").length, 0);
});

test("a lost preparation response and simultaneous submissions preserve one immutable send", async () => {
  const contacts = [contact(1), contact(2)];
  const db = database(contacts); const input = body(contacts);
  const results = await Promise.all([prepareNewsletter(db, input), prepareNewsletter(db, input)]);
  assert.equal(results[0].sendId, results[1].sendId);
  assert.equal(db.tables.get("newsletterSends").length, 1);
  assert.equal((await prepareNewsletter(db, input)).sendId, results[0].sendId);
  await assert.rejects(prepareNewsletter(db, { ...input, subject: "Changed" }), /already started/);
  const send = db.tables.get("newsletterSends")[0];
  assert.match(send.deliveryPlan[0].messages[0].payload.html, /id=NE-7K4P9X2Q/);
  assert.match(send.deliveryPlan[0].messages[0].payload.headers["List-Unsubscribe"], /token=/);
});

test("lost provider responses resume with an identical key and payload, sending each recipient once", async () => {
  const contacts = [contact(1), contact(2)]; const db = database(contacts); const p = provider(); p.loseOnce = true;
  const prepared = await prepareNewsletter(db, body(contacts));
  const first = await step(db, prepared.sendId, p);
  assert.equal(first.sentCount, 0); assert.equal(first.paused, true);
  const resumed = await step(db, prepared.sendId, p);
  assert.equal(resumed.sentCount, 2); assert.equal(p.deliveries, 2);
  assert.equal(p.calls[0].options.idempotencyKey, p.calls[1].options.idempotencyKey);
  const again = await step(db, prepared.sendId, p);
  assert.equal(again.sentCount, 2); assert.equal(p.calls.length, 2);
  assert.equal(db.tables.get("contactEmails").length, 2);
});

test("retrying a failed group never resends successful recipients", async () => {
  const contacts = Array.from({ length: 101 }, (_, i) => contact(i + 1));
  const db = database(contacts); const p = provider(); p.rejectAt = 2;
  const prepared = await prepareNewsletter(db, body(contacts));
  assert.equal((await step(db, prepared.sendId, p)).sentCount, 100);
  const failed = await step(db, prepared.sendId, p);
  assert.equal(failed.failedCount, 1); assert.equal(failed.pendingCount, 0);
  const retried = await step(db, prepared.sendId, p, { retryFailed: true });
  assert.equal(retried.sentCount, 101); assert.equal(retried.failedCount, 0);
  assert.equal(p.deliveries, 101); assert.equal(p.calls[2].messages.length, 1);
  assert.notEqual(p.calls[1].options.idempotencyKey, p.calls[2].options.idempotencyKey);
});

test("an accepted send with a failed database receipt write is reconciled without contacting Resend again", async () => {
  const contacts = [contact(1)]; const db = database(contacts); const p = provider();
  const prepared = await prepareNewsletter(db, body(contacts)); db.failReceiptOnce = true;
  await assert.rejects(step(db, prepared.sendId, p), /database receipt write failed/);
  const resumed = await step(db, prepared.sendId, p);
  assert.equal(resumed.sentCount, 1); assert.equal(p.calls.length, 1);
  assert.ok(db.tables.get("contactEmails")[0].resendEmailId);
});

test("incomplete provider receipts stay unconfirmed and expired uncertain attempts never resend automatically", async () => {
  const contacts = [contact(1)]; const db = database(contacts); const p = provider(); p.omitReceipt = true;
  const prepared = await prepareNewsletter(db, body(contacts));
  assert.equal((await step(db, prepared.sendId, p)).sentCount, 0);
  db.tables.get("newsletterSends")[0].deliveryPlan[0].firstAttemptAt = new Date(Date.now() - 24 * 3600000);
  const expired = await step(db, prepared.sendId, p);
  assert.equal(expired.reviewCount, 1); assert.equal(expired.pendingCount, 0); assert.equal(p.calls.length, 1);
});

test("opt-outs before dispatch are skipped and scheduled messages use provider scheduling without claiming sent", async () => {
  const contacts = [contact(1), contact(2)]; const db = database(contacts); const p = provider();
  const input = body(contacts);
  const date = new Date(Date.now() + 2 * 86400000);
  input.localTime = date.toISOString().slice(0, 16); input.timeZone = "UTC";
  const prepared = await prepareNewsletter(db, input);
  db.tables.get("contacts")[0].emailStatus = "unsubscribed";
  const queued = await step(db, prepared.sendId, p);
  assert.equal(queued.sentCount, 0); assert.equal(queued.scheduledCount, 1); assert.equal(queued.skippedCount, 1);
  assert.ok(p.calls[0].messages[0].scheduledAt);
  assert.equal(db.tables.get("contactEmails").find((a) => a.recipientEmail === contacts[1].email).status, "scheduled");
  let cancelled = 0;
  p.emails.cancel = async () => { cancelled++; return { data: {} }; };
  await cancellation.cancelScheduledNewsletters(db, contacts[1]._id, p);
  assert.equal(cancelled, 1);
  assert.equal(db.tables.get("newsletterSends")[0].deliveryPlan[1].state, "cancelled");
});

test("draft recovery preserves exclusions, scheduling, and retry identity", () => {
  const values = new Map(); const storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  const saved = { requestId: randomUUID(), excludedIds: ["excluded"], subject: "Thanksgiving", localTime: "2026-11-26T09:00", timeZone: "America/Chicago", sendId: "saved" };
  workflow.writeNewsletterDraft(storage, saved);
  assert.deepEqual(workflow.readNewsletterDraft(storage), saved);
});

test("concurrent dispatch requests share a lease so only one contacts the provider", async () => {
  const contacts = [contact(1)]; const db = database(contacts); const p = provider();
  const prepared = await prepareNewsletter(db, body(contacts));
  const original = p.batch.send;
  let release;
  let started;
  const gate = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { started = resolve; });
  p.batch.send = async (...args) => { started(); await gate; return original(...args); };
  const first = step(db, prepared.sendId, p);
  await entered;
  const second = await step(db, prepared.sendId, p);
  assert.equal(second.busy, true);
  release();
  assert.equal((await first).sentCount, 1);
  assert.equal(p.calls.length, 1);
});

test("an opt-out racing with provider scheduling cancels the accepted message", async () => {
  const contacts = [contact(1)]; const db = database(contacts); const p = provider();
  const input = body(contacts); input.localTime = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16); input.timeZone = "UTC";
  const prepared = await prepareNewsletter(db, input);
  const original = p.emails.send;
  p.emails.send = async (...args) => { db.tables.get("contacts")[0].emailStatus = "unsubscribed"; return original(...args); };
  let cancellations = 0;
  p.emails.cancel = async () => { cancellations++; return { data: {} }; };
  const result = await step(db, prepared.sendId, p);
  assert.equal(result.scheduledCount, 0); assert.equal(result.cancelledCount, 1); assert.equal(cancellations, 1);
});

test("a cancellation outage is recoverable after receipt saving without rescheduling the recipient", async () => {
  const contacts = [contact(1)]; const db = database(contacts); const p = provider();
  const input = body(contacts); input.localTime = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16); input.timeZone = "UTC";
  const prepared = await prepareNewsletter(db, input);
  const original = p.emails.send;
  p.emails.send = async (...args) => { db.tables.get("contacts")[0].emailStatus = "unsubscribed"; return original(...args); };
  p.emails.cancel = async () => ({ error: { message: "outage" } });
  p.emails.get = async () => ({ error: { message: "outage" } });
  await assert.rejects(step(db, prepared.sendId, p), /could not be cancelled/);
  p.emails.cancel = async () => ({ data: {} });
  const recovered = await step(db, prepared.sendId, p);
  assert.equal(recovered.cancelledCount, 1); assert.equal(p.calls.length, 1);
});
