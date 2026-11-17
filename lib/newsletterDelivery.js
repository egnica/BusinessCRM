import { cancelScheduledNewsletters } from "./cancelScheduledNewsletters.js";
import { createHash, randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { getEmailTemplate } from "./emailTemplates/index.js";
import { getNewsletterConfigStatus, resolveNewsletterSender, EMAIL_REPLY_TO } from "./newsletterConfig.js";
import { getEmailBaseUrl } from "./emailBaseUrl.mjs";
import { createUnsubscribeToken } from "./unsubscribe.js";
import { normalizeTrackingId, renderTrackedCampaignTemplate } from "./emailTemplates/_trackingLinks.mjs";
import { createEmailActivityRecord, ensureEmailActivityIndexes, markEmailActivitySent } from "./emailActivity.js";
import { CONTACT_REVIEW_PROJECTION, reviewNewsletterRecipients, newsletterSchedule, newsletterBlockedReason, deliverySummary } from "./newsletterWorkflow.mjs";

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function publicDelivery(send) {
  const { deliveryPlan: _plan, requestHash: _hash, lockToken: _lock, lockUntil: _until, ...result } = send;
  return {
    ...result, ...deliverySummary(send), sendId: String(send._id),
    recipients: (send.deliveryPlan || []).flatMap((task) => task.messages.map((item) => {
      const skipped = task.skippedIds?.includes(String(item.contactId));
      const status = skipped ? "skipped" : task.state === "accepted" ? (send.scheduledAt ? "scheduled" : "sent") : task.state;
      return { id: String(item.contactId), email: item.payload.to, name: item.activity.recipientName,
        eligible: true, included: !skipped && task.state !== "cancelled", reason: status };
    })),
    errors: (send.deliveryPlan || []).filter((t) => t.error).map((t) => ({ state: t.state, message: t.error })),
  };
}

export async function prepareNewsletter(db, body) {
  if (!/^[a-f0-9-]{36}$/i.test(body.requestId || "")) throw fail("Invalid newsletter draft ID. Start a new draft.");
  if (!Array.isArray(body.contactIds) || !body.contactIds.length || body.contactIds.some((id) => typeof id !== "string" || !ObjectId.isValid(id))) {
    throw fail("Review and select at least one valid recipient.");
  }
  const contactIds = [...new Set(body.contactIds)].sort();
  const input = { templateId: body.templateId, subject: String(body.subject || "").trim(), fromEmail: body.fromEmail,
    contactIds, localTime: body.localTime || "", timeZone: body.timeZone || "", revision: body.revision };
  const requestHash = digest(input);
  const _id = new ObjectId(digest(body.requestId).slice(0, 24));
  const sends = db.collection("newsletterSends");
  const existing = await sends.findOne({ _id });
  if (existing) {
    if (existing.requestHash !== requestHash) throw fail("This draft already started sending. Resume it or start a new newsletter.", 409);
    return publicDelivery(existing);
  }
  const config = getNewsletterConfigStatus();
  if (!config.configured) throw fail(config.setupIssues.join(" "), 503);
  const template = getEmailTemplate(input.templateId);
  if (!template) throw fail("Template not found.", 404);
  let sender;
  let scheduledAt;
  try {
    sender = resolveNewsletterSender(input.fromEmail);
    scheduledAt = newsletterSchedule(input.localTime, input.timeZone);
  } catch (error) { throw fail(error.message); }
  const contacts = await db.collection("contacts").find({}, { projection: CONTACT_REVIEW_PROJECTION }).toArray();
  const reviewed = reviewNewsletterRecipients(contacts);
  if (digest(reviewed) !== input.revision) throw fail("Your contact list changed. Refresh recipients and review the updated list before sending.", 409);
  const eligible = new Map(reviewed.filter((r) => r.eligible).map((r) => [r.id, r]));
  if (contactIds.some((id) => !eligible.has(id))) throw fail("Some selected recipients are no longer eligible. Refresh recipients.", 409);
  const byId = new Map(contacts.map((c) => [String(c._id), c]));
  const selected = contactIds.map((id) => ({ ...byId.get(id), email: eligible.get(id).email }));
  // Validate EVERY recipient before creating a send, activity, or provider request.
  if (selected.some((c) => !normalizeTrackingId(c.trackingId))) {
    throw fail("Some recipients lack valid tracking IDs. Refresh the CRM contacts, then review recipients again.");
  }
  const baseUrl = getEmailBaseUrl();
  const now = new Date();
  const subject = input.subject || template.subject;
  const messages = selected.map((contact) => {
    const recipientName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || "there";
    const token = createUnsubscribeToken(contact._id, _id);
    const html = renderTrackedCampaignTemplate(template, contact, { recipientName, unsubscribeUrl: `${baseUrl}/unsubscribe?token=${encodeURIComponent(token)}` });
    const activity = createEmailActivityRecord({ source: "campaign", sendToken: `campaign-${_id}-${contact._id}`, contactId: contact._id,
      campaignId: _id, templateId: template.id, recipientEmail: contact.email, recipientName,
      fromEmail: sender.address, replyTo: EMAIL_REPLY_TO, subject, renderedHtml: html });
    return {
      contactId: contact._id, recipientId: new ObjectId(), activity,
      payload: { from: sender.address, replyTo: EMAIL_REPLY_TO, to: contact.email, subject, html,
        ...(scheduledAt ? { scheduledAt } : {}),
        headers: { "List-Unsubscribe": `<${baseUrl}/api/newsletters/unsubscribe?token=${encodeURIComponent(token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "crm_type", value: "campaign" }, { name: "crm_email_id", value: String(activity._id) }, { name: "contact_id", value: String(contact._id) }],
      },
    };
  });
  const chunkSize = scheduledAt ? 1 : 100;
  const deliveryPlan = [];
  for (let i = 0; i < messages.length; i += chunkSize) {
    deliveryPlan.push({ state: "pending", attempt: 0, messages: messages.slice(i, i + chunkSize) });
  }
  const send = { _id, requestHash, requestId: body.requestId, deliveryVersion: 2, templateId: template.id, templateName: template.name,
    subject, fromEmail: sender.email, replyTo: EMAIL_REPLY_TO, sendType: "newsletter-reviewed", recipientCount: selected.length,
    scheduledAt, localTime: input.localTime, timeZone: input.timeZone, sentAt: scheduledAt ? null : now,
    createdAt: now, updatedAt: now, unsubscribeCount: 0, deliveryPlan, ...deliverySummary({ deliveryPlan, scheduledAt }) };
  if (Buffer.byteLength(JSON.stringify(send)) > 12 * 1024 * 1024) throw fail("This newsletter is too large. Select a smaller group of recipients.");
  try { await sends.insertOne(send); }
  catch (error) {
    if (error.code !== 11000) throw error;
    const saved = await sends.findOne({ _id });
    if (saved?.requestHash !== requestHash) throw fail("This draft already started with different settings.", 409);
    return publicDelivery(saved);
  }
  return publicDelivery(send);
}

// Keep recipient rows and webhook targets stable, including after process crashes.
async function persistReceipt(db, send, task) {
  const results = await Promise.allSettled(task.messages.map(async (item) => {
    const { activity, recipientId, contactId, payload } = item;
    await db.collection("contactEmails").updateOne({ _id: activity._id }, { $setOnInsert: { ...activity, status: "queued" } }, { upsert: true });
    await db.collection("newsletterRecipients").updateOne({ _id: recipientId }, { $setOnInsert: {
      _id: recipientId, sendId: send._id, contactId, email: payload.to, recipientName: activity.recipientName,
      emailActivityId: activity._id, status: "queued", unsubscribedAt: null, createdAt: send.createdAt,
    } }, { upsert: true });
    const index = task.activeIds?.indexOf(String(contactId)) ?? -1;
    const skipped = task.skippedIds?.includes(String(contactId));
    const accepted = task.state === "accepted" && index >= 0;
    const status = skipped ? "skipped" : accepted ? (send.scheduledAt ? "scheduled" : "sent") : task.state;
    const update = { status, updatedAt: new Date(), error: task.error || null };
    if (accepted) {
      update.resendEmailId = task.receipts[index];
      update[send.scheduledAt ? "scheduledAt" : "sentAt"] = send.scheduledAt ? new Date(send.scheduledAt) : task.acceptedAt;
    }
    // Respect webhook events and unsubscribe status that may arrive before this response.
    await db.collection("newsletterRecipients").updateOne({ _id: recipientId, unsubscribedAt: null }, { $set: update });
    if (accepted && !send.scheduledAt) {
      await db.collection("contactEmails").updateOne({ _id: activity._id, status: "queued" }, { $set: { status: "sending" } });
      await markEmailActivitySent(db.collection("contactEmails"), activity._id, task.receipts[index]);
    } else {
      await db.collection("contactEmails").updateOne({ _id: activity._id, status: { $in: ["queued", "pending", "sending", "failed", "uncertain", "needs-review"] } }, {
        $set: { status, updatedAt: new Date(), failureMessage: task.error || null,
          ...(accepted ? { resendEmailId: task.receipts[index], scheduledAt: new Date(send.scheduledAt) } : {}) },
      });
    }
  }));
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

export async function processNewsletter(db, id, resend, { retryFailed = false, pause = wait } = {}) {
  if (!ObjectId.isValid(id)) throw fail("Invalid send ID.");
  const sends = db.collection("newsletterSends");
  const _id = new ObjectId(id);
  const lockToken = randomUUID();
  let send = await sends.findOneAndUpdate({ _id, deliveryVersion: 2, $or: [{ lockUntil: { $exists: false } }, { lockUntil: { $lt: new Date() } }] },
    { $set: { lockToken, lockUntil: new Date(Date.now() + 120000) } }, { returnDocument: "after" });
  if (!send) {
    send = await sends.findOne({ _id, deliveryVersion: 2 });
    if (!send) throw fail("Newsletter send not found.", 404);
    return { ...publicDelivery(send), busy: true };
  }
  try {
    if (!getNewsletterConfigStatus().configured) throw fail("Email setup is incomplete. Check setup before resuming.", 503);
    await ensureEmailActivityIndexes(db.collection("contactEmails"));
    if (retryFailed) {
      for (let i = 0; i < send.deliveryPlan.length; i++) {
        const task = send.deliveryPlan[i];
        if (task.state === "failed") {
          task.state = "pending"; task.attempt += 1; delete task.firstAttemptAt; delete task.error;
          // Persist new attempt identities BEFORE contacting the provider.
          await sends.updateOne({ _id, lockToken, [`deliveryPlan.${i}.state`]: "failed" }, { $set: { [`deliveryPlan.${i}`]: task, updatedAt: new Date() } });
        }
      }
    }
    // Reconcile a committed provider receipt after an interrupted database write.
    for (const task of send.deliveryPlan.filter((t) => t.state === "accepted" && !t.receiptSaved)) {
      await persistReceipt(db, send, task);
      task.receiptSaved = true;
      await sends.updateOne({ _id, lockToken }, { $set: { [`deliveryPlan.${send.deliveryPlan.indexOf(task)}`]: task } });
    }
    // Retry cancellation after a provider/DB outage, even if receipt saving finished.
    if (send.scheduledAt) {
      const accepted = send.deliveryPlan.filter((task) => task.state === "accepted");
      if (accepted.length) {
        const current = await db.collection("contacts").find({ _id: { $in: accepted.map((task) => task.messages[0].contactId) } }).toArray();
        const eligible = new Set(current.filter((contact) => !newsletterBlockedReason(contact)).map((contact) => String(contact._id)));
        for (const task of accepted) {
          if (!eligible.has(String(task.messages[0].contactId))) await cancelScheduledNewsletters(db, task.messages[0].contactId, resend);
        }
        send = await sends.findOne({ _id });
      }
    }
    const limit = send.scheduledAt ? 6 : 1;
    let processed = 0;
    for (let i = 0; i < send.deliveryPlan.length && processed < limit; i++) {
      const task = send.deliveryPlan[i];
      if (!["pending", "uncertain"].includes(task.state)) continue;
      processed++;
      if (task.firstAttemptAt && Date.now() - new Date(task.firstAttemptAt).getTime() > 23 * 3600000) {
        task.state = "needs-review";
        task.error = "Delivery could not be confirmed before duplicate protection expired. Check this send in Resend before taking further action.";
      } else if (send.scheduledAt && new Date(send.scheduledAt).getTime() <= Date.now() + 30000) {
        task.state = "needs-review";
        task.error = "The scheduled time has passed or is too close. Review queued recipients in Resend; unqueued recipients were not sent.";
      } else {
        const latest = await db.collection("contacts").find({ _id: { $in: task.messages.map((m) => m.contactId) } }).toArray();
        const eligible = new Map(latest.filter((c) => !newsletterBlockedReason(c)).map((c) => [String(c._id), String(c.email || "").trim().toLowerCase()]));
        const valid = task.messages.filter((m) => eligible.get(String(m.contactId)) === m.payload.to);
        if (task.firstAttemptAt && task.activeIds.some((id) => !valid.some((m) => String(m.contactId) === id))) {
          task.state = "needs-review";
          task.error = "A recipient changed after an unconfirmed attempt. Check delivery in Resend before retrying.";
        } else {
          if (!task.firstAttemptAt) {
            task.activeIds = valid.map((m) => String(m.contactId));
            task.skippedIds = task.messages.filter((m) => !task.activeIds.includes(String(m.contactId))).map((m) => String(m.contactId));
          }
          if (!task.activeIds.length) task.state = "skipped";
          else {
            task.firstAttemptAt ||= new Date();
            task.state = "uncertain"; // Persist before send; retry uses identical payload and key.
            await sends.updateOne({ _id, lockToken }, { $set: { [`deliveryPlan.${i}`]: task, updatedAt: new Date() } });
            await persistReceipt(db, send, task);
            const active = task.messages.filter((m) => task.activeIds.includes(String(m.contactId)));
            try {
              const options = { idempotencyKey: `newsletter-${_id}-${i}-${task.attempt}` };
              const result = send.scheduledAt ? await resend.emails.send(active[0].payload, options) : await resend.batch.send(active.map((m) => m.payload), options);
              if (result.error) {
                // Only explicit rejection is safe to retry with a new attempt key.
                const status = result.error.statusCode;
                task.state = status >= 400 && status < 500 && status !== 408 && status !== 409 ? "failed" : "uncertain";
                task.error = result.error.message || "Provider request failed.";
              } else {
                const receipts = send.scheduledAt ? [result.data?.id] : (result.data?.data || []).map((r) => r.id);
                if (receipts.length !== active.length || receipts.some((receipt) => !receipt)) throw new Error("Provider response did not confirm every recipient.");
                task.state = "accepted"; task.receipts = receipts; task.acceptedAt = new Date(); delete task.error;
              }
            } catch (error) { task.state = "uncertain"; task.error = error.message || "Connection interrupted. Resume to check the same send safely."; }
          }
        }
      }
      await sends.updateOne({ _id, lockToken }, { $set: { [`deliveryPlan.${i}`]: task, updatedAt: new Date() } });
      await persistReceipt(db, send, task);
      if (task.state === "accepted") {
        task.receiptSaved = true;
        await sends.updateOne({ _id, lockToken }, { $set: { [`deliveryPlan.${i}`]: task } });
        if (send.scheduledAt) {
          const current = await db.collection("contacts").findOne({ _id: task.messages[0].contactId });
          if (!current || newsletterBlockedReason(current)) {
            await cancelScheduledNewsletters(db, task.messages[0].contactId, resend);
            task.state = "cancelled";
          }
        }
      }
      // Stop on an uncertain result. A later explicit Resume reuses the same key.
      if (task.state === "uncertain") break;
      if (send.scheduledAt) await pause(600);
    }
    // Opt-outs can cancel queued tasks concurrently with this processing request.
    send = await sends.findOne({ _id });
    const summary = deliverySummary(send);
    await sends.updateOne({ _id, lockToken }, { $set: { ...summary, updatedAt: new Date() } });
    return { ...publicDelivery(send), paused: send.deliveryPlan.some((t) => t.state === "uncertain") };
  } finally {
    await sends.updateOne({ _id, lockToken }, { $unset: { lockToken: "", lockUntil: "" } });
  }
}
