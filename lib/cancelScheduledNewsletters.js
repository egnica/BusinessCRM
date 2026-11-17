import { Resend } from "resend";
import { deliverySummary } from "./newsletterWorkflow.mjs";

// Cancel provider-queued messages as well as preventing future queue submissions.
// Cancellation is retried on repeated unsubscribe POSTs if the provider is down.
export async function cancelScheduledNewsletters(db, contactId, provider) {
  if (!process.env.RESEND_API_KEY && !provider) return;
  const resend = provider || new Resend(process.env.RESEND_API_KEY);
  const sends = await db.collection("newsletterSends").find({
    deliveryVersion: 2, scheduledAt: { $ne: null }, "deliveryPlan.messages.contactId": contactId,
  }).toArray();
  for (const send of sends) {
    for (let i = 0; i < send.deliveryPlan.length; i++) {
      const task = send.deliveryPlan[i];
      if (task.state !== "accepted") continue;
      const item = task.messages.find((message) => String(message.contactId) === String(contactId));
      if (!item) continue;
      const index = task.activeIds.indexOf(String(contactId));
      const emailId = task.receipts?.[index];
      if (!emailId) continue;
      const result = await resend.emails.cancel(emailId);
      if (result.error) {
        // An already-sent or already-cancelled message cannot be cancelled again.
        const lookup = await resend.emails.get(emailId);
        if (!lookup.error && ["sent", "delivered", "opened", "clicked", "bounced", "failed", "suppressed"].includes(lookup.data?.last_event)) continue;
        if (lookup.error || !["canceled", "cancelled"].includes(lookup.data?.last_event)) {
          throw new Error("Email preference saved, but a scheduled email could not be cancelled yet. Retry to complete cancellation.");
        }
      }
      const updated = await db.collection("newsletterSends").updateOne({ _id: send._id, [`deliveryPlan.${i}.state`]: "accepted" }, {
        $set: { [`deliveryPlan.${i}.state`]: "cancelled", updatedAt: new Date() },
      });
      if (updated.modifiedCount) {
        const current = await db.collection("newsletterSends").findOne({ _id: send._id });
        await db.collection("newsletterSends").updateOne({ _id: send._id }, { $set: { ...deliverySummary(current), updatedAt: new Date() } });
      }
      await db.collection("contactEmails").updateOne({ _id: item.activity._id, status: { $in: ["scheduled", "queued", "sending"] } }, {
        $set: { status: "cancelled", updatedAt: new Date() },
      });
      await db.collection("newsletterRecipients").updateOne({ _id: item.recipientId, unsubscribedAt: null, status: { $in: ["scheduled", "queued", "accepted"] } }, {
        $set: { status: "cancelled", updatedAt: new Date() },
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
}
