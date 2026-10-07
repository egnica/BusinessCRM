import { Resend } from "resend";
import { getEmailTemplate } from "@/lib/emailTemplates";
import getMongoClient from "@/lib/mongodb";
import {
  getNewsletterConfigStatus,
  getNewsletterFromAddress,
} from "@/lib/newsletterConfig";

const TRACKING_ID_PATTERN = /^NE-[A-HJ-NP-Z2-9]{8}$/;

async function getTrackedRecipientName(trackingId, fallbackName) {
  const normalizedTrackingId = String(trackingId || "").trim().toUpperCase();

  if (!normalizedTrackingId) {
    return { recipientName: fallbackName, trackingId: "" };
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
  };
}

export async function POST(req) {
  try {
    const { templateId, subject, email, trackingId } = await req.json();

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

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: getNewsletterFromAddress(),
      to: email,
      subject: testSubject,
      html: template.render({
        recipientName: testRecipient.recipientName,
        trackingId: testRecipient.trackingId,
        unsubscribeUrl: "#",
      }),
    });

    if (error) {
      console.error("Resend test error:", error);
      return Response.json(
        { error: error.message || "Failed to send test email" },
        { status: 500 },
      );
    }

    return Response.json({
      message: "Test email sent",
      id: data?.id || null,
      from: config.fromEmail,
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
