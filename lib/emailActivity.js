import { ObjectId } from "mongodb";

export async function ensureEmailActivityIndexes(collection) {
  await Promise.all([
    collection.createIndex(
      { resendEmailId: 1 },
      { sparse: true, name: "resend_email_lookup" },
    ),
    collection.createIndex(
      { createdAt: -1 },
      { name: "email_activity_created_at" },
    ),
  ]);
}

export function createEmailActivityRecord({
  source,
  sendToken = "",
  contactId = null,
  campaignId = null,
  templateId = "",
  personalizationContactId = null,
  recipientEmail = "",
  recipientName = "",
  fromEmail = "",
  replyTo = "",
  subject = "",
  preheader = "",
  bodyHtml = "",
  renderedHtml = "",
}) {
  const now = new Date();

  return {
    _id: new ObjectId(),
    source,
    sendToken,
    contactId,
    campaignId,
    templateId,
    personalizationContactId,
    recipientEmail,
    recipientName,
    fromEmail,
    replyTo,
    subject,
    preheader,
    bodyHtml,
    renderedHtml,
    status: "sending",
    resendEmailId: null,
    messageId: null,
    sentAt: null,
    eventTimestamps: {},
    events: [],
    webhookEventIds: [],
    failureMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function markEmailActivitySent(
  collection,
  emailRecordId,
  resendEmailId,
) {
  const sentAt = new Date();

  await collection.updateOne(
    { _id: emailRecordId },
    {
      $set: {
        resendEmailId: resendEmailId || null,
        sentAt,
        "eventTimestamps.sentAt": sentAt,
        updatedAt: sentAt,
        failureMessage: null,
      },
    },
  );

  await collection.updateOne(
    {
      _id: emailRecordId,
      status: { $in: ["sending", "failed"] },
    },
    { $set: { status: "sent" } },
  );

  return sentAt;
}

export async function markEmailActivityFailed(
  collection,
  emailRecordId,
  error,
) {
  await collection.updateOne(
    { _id: emailRecordId },
    {
      $set: {
        status: "failed",
        failureMessage: error?.message || "Email send failed",
        updatedAt: new Date(),
      },
    },
  );
}
