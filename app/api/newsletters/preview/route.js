import { getEmailTemplate } from "@/lib/emailTemplates";
import getMongoClient from "@/lib/mongodb";

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
    const { templateId, trackingId } = await req.json();
    const template = getEmailTemplate(templateId);

    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }
    const testRecipient = await getTrackedRecipientName(
      trackingId,
      "Sample Contact",
    );

    const html = template.render({
      recipientName: testRecipient.recipientName,
      trackingId: testRecipient.trackingId,
      unsubscribeUrl: "#",
    });

    return Response.json({
      html,
      subject: template.subject,
      recipientName: testRecipient.recipientName,
      trackingId: testRecipient.trackingId,
    });
  } catch (error) {
    console.error("Newsletter preview error:", error);
    const message = error?.message || "Failed to preview newsletter";
    const isTrackingError =
      message.startsWith("Enter a valid tracking ID") ||
      message.startsWith("No CRM contact was found");
    return Response.json(
      { error: isTrackingError ? message : "Failed to preview newsletter" },
      { status: isTrackingError ? 400 : 500 },
    );
  }
}
