import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { createConnectionManager } from "../lib/mongoConnection.mjs";
import { CONTACT_DRAFT_KEY, EMPTY_CONTACT, readContactDraft, writeContactDraft } from "../lib/contactDraft.mjs";

test("failed initial connection is released and the next concurrent requests recover using one pool", async () => {
  let attempts = 0;
  let closed = 0;
  const getClient = createConnectionManager(() => {
    const number = ++attempts;
    const client = {
      async connect() {
        if (number === 1) throw new Error("temporary outage");
        return client;
      },
      async close() { closed++; },
    };
    return client;
  });
  const first = getClient();
  assert.equal(getClient(), first);
  await assert.rejects(first, /temporary outage/);
  const clients = await Promise.all([getClient(), getClient(), getClient()]);
  assert.equal(attempts, 2);
  assert.equal(closed, 1);
  assert.equal(clients[0], clients[2]);
  assert.equal(await getClient(), clients[0]);
});

test("a synchronous configuration failure does not permanently poison the connection", async () => {
  let configured = false;
  const client = { async connect() { return client; } };
  const getClient = createConnectionManager(() => {
    if (!configured) throw new Error("missing configuration");
    return client;
  });
  await assert.rejects(getClient(), /missing configuration/);
  configured = true;
  assert.equal(await getClient(), client);
});

test("contact details and retry identity survive a browser refresh and clear only explicitly", () => {
  const entries = new Map();
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  const requestId = randomUUID();
  const formData = { ...EMPTY_CONTACT, firstName: "Test", lastName: "Contact", email: "test@example.com", linkedin: "https://www.linkedin.com/in/test", propertyStreet1: "123 Test Street" };
  writeContactDraft(storage, formData, requestId);
  assert.deepEqual(readContactDraft(storage), { formData, requestId });
  storage.setItem(CONTACT_DRAFT_KEY, "invalid json");
  assert.throws(() => readContactDraft(storage));
  writeContactDraft(storage, EMPTY_CONTACT, requestId);
  assert.equal(readContactDraft(storage), null);
});

// Evaluate the actual handlers with the database boundary replaced. No live
// contacts or credentials are used by these failure/retry tests.
const routeSource = (await readFile(new URL("../app/api/contacts/route.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace(/export async function/g, "async function");
const handlers = (collection) => new Function("getMongoClient", "ObjectId", "createHash",
  `${routeSource}\nreturn { GET, POST };`)(
    async () => ({ db: () => ({ collection: () => collection }) }), ObjectId, createHash,
  );
const contactBody = { firstName: "Test", lastName: "Contact", ownerType: "individual", email: "test@example.com", createdAt: "2026-10-02T20:00:00Z", updatedAt: "2026-10-02T20:00:00Z" };
const request = (key, body = contactBody) => new Request("https://example.com/api/contacts", {
  method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body),
});

test("retrying a committed contact with a lost response creates only one record", async () => {
  const records = new Map();
  const collection = {
    async updateOne(filter, update) {
      const key = String(filter._id);
      if (records.has(key)) return { upsertedCount: 0 };
      records.set(key, { ...update.$setOnInsert, _id: filter._id });
      return { upsertedCount: 1 };
    },
    async findOne(filter) { return records.get(String(filter._id)); },
  };
  const { POST } = handlers(collection);
  const key = randomUUID();
  assert.equal((await POST(request(key))).status, 201);
  const retry = await POST(request(key, { ...contactBody, createdAt: "2026-10-02T20:01:00Z", updatedAt: "2026-10-02T20:01:00Z" }));
  assert.equal(retry.status, 200);
  assert.equal(records.size, 1);
  assert.equal((await retry.json()).contact.email, contactBody.email);
  assert.equal((await POST(request(key, { ...contactBody, email: "edited@example.com" }))).status, 409);
  assert.equal(records.size, 1);
  assert.equal([...records.values()][0].email, contactBody.email);
});

test("concurrent save duplicate-key race returns the already saved contact", async () => {
  const key = randomUUID();
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...content } = { ...contactBody, emailStatus: "subscribed" };
  const saved = { ...contactBody, _id: new ObjectId(createHash("sha256").update(key).digest("hex").slice(0, 24)), createRequestHash: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
  const { POST } = handlers({
    async updateOne() { throw Object.assign(new Error("duplicate key"), { code: 11000 }); },
    async findOne() { return saved; },
  });
  const response = await POST(request(key));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).insertedId, String(saved._id));
});

test("loading legacy contacts applies defaults without writing to the database", async () => {
  const { GET } = handlers({
    find: () => ({ sort: () => ({ toArray: async () => [{ _id: "old", emailStatus: "" }, { _id: "opted-out", emailStatus: "unsubscribed" }] }) }),
    updateMany() { assert.fail("contact reads must not write"); },
  });
  const response = await GET();
  assert.equal(response.status, 200);
  const { contacts } = await response.json();
  assert.equal(contacts[0].emailStatus, "subscribed");
  assert.equal(contacts[1].emailStatus, "unsubscribed");
});
