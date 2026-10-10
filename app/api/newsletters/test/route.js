import { EMAIL_REPLY_TO } from "@/lib/newsletterConfig";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { getEmailTemplate } from "@/lib/emailTemplates";
import getMongoClient from "@/lib/mongodb";
import {
  getNewsletterConfigStatus,
  resolveNewsletterSender,
} from "@/lib/newsletterConfig";
import {
  createEmailActivityRecord,
  ensureEmailActivityIndexes,
  markEmailActivityFailed,
  markEmailActivitySent,
} from "@/lib/emailActivity";

const TRACKING_ID_PATTERN = /^NE-[A-HJ-NP-Z2-9]{8}$/;

async function getTrackedRecipientName(trackingId, fallbackName) {
  const normalizedTrackingId = String(trackingId || "").trim().toUpperCase();

  if (!normalizedTrackingId) {
    return { recipientName: fallbackName, trackingId: "", contactId: null };
  }

  if (!TRACKING_ID_PATTERN.test(normalizedTrackingId)) {
    throw new Error("Enter a valid tracking ID, like NE-7K4P9X2Q.");
  }

  const client = await getMongoClient();
  const db = client.db("crm");
  const contact = await db.collection("contacts").findOne(
    { trackingId: normalizedTrackingId },
    { projection: { firstName: 1, trackingId: 1 } },
  );

  if (!contact) {
    throw new Error("No CRM contact was found for that tracking ID.");
  }

  return {
    recipientName: String(contact.firstName || "").trim() || fallbackName,
    trackingId: normalizedTrackingId,
    contactId: contact._id,
  };
}

export async function POST(req) {
  try {
    const { templateId, subject, email, trackingId, fromEmail } = await req.json();

    if (!email) {
      return Response.json(
        { error: "A test recipient email is required" },
        { status: 400 },
      );
    }

    const template = getEmailTemplate(templateId);

    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    let sender;
    try {
      sender = resolveNewsletterSender(fromEmail);
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    const config = getNewsletterConfigStatus();

    if (!config.resendConfigured) {
      return Response.json(
        { error: "Resend environment variables are not configured" },
        { status: 500 },
      );
    }

    const finalSubject = subject?.trim() || template.subject;
    const testSubject = finalSubject.startsWith("[TEST]")
      ? finalSubject
      : `[TEST] ${finalSubject}`;
    const testRecipient = await getTrackedRecipientName(
      trackingId,
      "Test Recipient",
    );
    const fromAddress = sender.address;

    const client = await getMongoClient();
    const db = client.db("crm");
    const activityCollection = db.collection("contactEmails");
    await ensureEmailActivityIndexes(activityCollection);

    const renderedHtml = template.render({
      recipientName: testRecipient.recipientName,
      trackingId: testRecipient.trackingId,
      unsubscribeUrl: "#",
    });
    const activity = createEmailActivityRecord({
      source: "template-test",
      sendToken: `template-test-${randomUUID()}`,
      templateId,
      personalizationContactId: testRecipient.contactId,
      recipientEmail: email,
      recipientName: testRecipient.recipientName,
      fromEmail: fromAddress,
      replyTo: EMAIL_REPLY_TO,
      subject: testSubject,
      renderedHtml,
    });
    await activityCollection.insertOne(activity);

    const resend = new Resend(process.env.RESEND_API_KEY);
    let data = null;
    let sendError = null;

    try {
      const result = await resend.emails.send({
        from: fromAddress,
        replyTo: EMAIL_REPLY_TO,
        to: email,
        subject: testSubject,
        html: renderedHtml,
        tags: [
          { name: "crm_type", value: "template_test" },
          { name: "crm_email_id", value: String(activity._id) },
        ],
      });
      data = result.data;
      sendError = result.error;
    } catch (error) {
      await markEmailActivityFailed(activityCollection, activity._id, error);
      throw error;
    }

    if (sendError) {
      await markEmailActivityFailed(activityCollection, activity._id, sendError);
      console.error("Resend test error:", sendError);
      return Response.json(
        { error: sendError.message || "Failed to send test email" },
        { status: 500 },
      );
    }

    await markEmailActivitySent(
      activityCollection,
      activity._id,
      data?.id || null,
    );

    return Response.json({
      message: "Test email sent",
      id: data?.id || null,
      from: fromAddress,
      replyTo: EMAIL_REPLY_TO,
      subject: testSubject,
      recipientName: testRecipient.recipientName,
      trackingId: testRecipient.trackingId,
    });
  } catch (error) {
    console.error("Newsletter test error:", error);
    const message = error?.message || "Failed to send test email";
    const isTrackingError =
      message.startsWith("Enter a valid tracking ID") ||
      message.startsWith("No CRM contact was found");
    return Response.json(
      { error: isTrackingError ? message : "Failed to send test email" },
      { status: isTrackingError ? 400 : 500 },
    );
  }
}

