import { ObjectId } from "mongodb";
import { Resend } from "resend";
import getMongoClient from "@/lib/mongodb";
import { getEmailTemplate } from "@/lib/emailTemplates";
import {
  getIntroductionFromAddress,
  getNewsletterConfigStatus,
} from "@/lib/newsletterConfig";
import { createUnsubscribeToken } from "@/lib/unsubscribe";
import {
  createEmailActivityRecord,
  ensureEmailActivityIndexes,
  markEmailActivityFailed,
  markEmailActivitySent,
} from "@/lib/emailActivity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTRO_TEMPLATE_ID = "introduction-email";

function getIntroStatus(contact) {
  if (contact?.introEmail?.status) return contact.introEmail.status;
  if (contact?.introEmail?.sent) return "sent";
  return "pending";
}

function introRecipientName(contact) {
  return String(contact?.firstName || "").trim() || "there";
}

async function getContact(db, id) {
  if (!ObjectId.isValid(id)) return null;

  return db.collection("contacts").findOne({
    _id: new ObjectId(id),
  });
}

export async function GET(req, { params }) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return Response.json({ error: "Invalid contact ID" }, { status: 400 });
    }

    const client = await getMongoClient();
    const db = client.db("crm");
    const contact = await getContact(db, id);

    if (!contact) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    const template = getEmailTemplate(INTRO_TEMPLATE_ID);

    if (!template) {
      return Response.json(
        { error: "Introduction email template is not available" },
        { status: 500 },
      );
    }

    const previewHtml = template.render({
      recipientName: introRecipientName(contact),
      trackingId: contact.trackingId || "",
      unsubscribeUrl: "#",
    });

    return Response.json({
      contactId: String(contact._id),
      recipientName: introRecipientName(contact),
      email: contact.email || "",
      emailStatus: contact.emailStatus || "subscribed",
      introStatus: getIntroStatus(contact),
      subject: template.subject,
      html: previewHtml,
    });
  } catch (error) {
    console.error("Intro email preview error:", error);
    return Response.json(
      { error: "Failed to preview introduction email" },
      { status: 500 },
    );
  }
}

export async function POST(req, { params }) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return Response.json({ error: "Invalid contact ID" }, { status: 400 });
    }

    const body = await req.json();
    const action = body?.action;

    const client = await getMongoClient();
    const db = client.db("crm");
    const contact = await getContact(db, id);

    if (!contact) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    const currentStatus = getIntroStatus(contact);
    const now = new Date();

    if (action === "cancel") {
      if (currentStatus === "sent") {
        return Response.json(
          { error: "A sent introduction email cannot be cancelled" },
          { status: 409 },
        );
      }

      const introEmail = {
        ...(contact.introEmail || {}),
        status: "cancelled",
        sent: false,
        sentAt: contact.introEmail?.sentAt || null,
        cancelledAt: now.toISOString(),
      };

      await db.collection("contacts").updateOne(
        { _id: contact._id },
        {
          $set: {
            introEmail,
            updatedAt: now.toISOString(),
          },
        },
      );

      return Response.json({
        message: "Introduction email cancelled",
        introEmail,
      });
    }

    if (action === "restore") {
      if (currentStatus !== "cancelled") {
        return Response.json(
          { error: "Only a cancelled introduction email can be restored" },
          { status: 409 },
        );
      }

      const introEmail = {
        ...(contact.introEmail || {}),
        status: "pending",
        sent: false,
        sentAt: null,
        cancelledAt: null,
        resendEmailId: null,
      };

      await db.collection("contacts").updateOne(
        { _id: contact._id },
        {
          $set: {
            introEmail,
            updatedAt: now.toISOString(),
          },
        },
      );

      return Response.json({
        message: "Introduction email restored",
        introEmail,
      });
    }

    if (action !== "send") {
      return Response.json(
        { error: "Unsupported introduction email action" },
        { status: 400 },
      );
    }

    if (currentStatus === "sent") {
      return Response.json(
        { error: "Introduction email has already been sent" },
        { status: 409 },
      );
    }

    if (currentStatus === "cancelled") {
      return Response.json(
        { error: "Introduction email is cancelled for this contact" },
        { status: 409 },
      );
    }

    const email = String(contact.email || "").trim();

    if (!email) {
      return Response.json(
        { error: "This contact does not have an email address" },
        { status: 400 },
      );
    }

    if (contact.emailStatus === "unsubscribed") {
      return Response.json(
        { error: "This contact has unsubscribed from email" },
        { status: 400 },
      );
    }

    const config = getNewsletterConfigStatus();

    if (!config.configured) {
      return Response.json(
        { error: "Email sending is not fully configured" },
        { status: 500 },
      );
    }

    const template = getEmailTemplate(INTRO_TEMPLATE_ID);

    if (!template) {
      return Response.json(
        { error: "Introduction email template is not available" },
        { status: 500 },
      );
    }

    const unsubscribeReferenceId = new ObjectId();
    const baseUrl = (
      process.env.APP_BASE_URL || new URL(req.url).origin
    ).replace(/\/$/, "");
    const token = createUnsubscribeToken(
      contact._id,
      unsubscribeReferenceId,
    );
    const unsubscribeUrl =
      `${baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
    const oneClickUnsubscribeUrl =
      `${baseUrl}/api/newsletters/unsubscribe?token=${encodeURIComponent(token)}`;

    const activityCollection = db.collection("contactEmails");
    await ensureEmailActivityIndexes(activityCollection);

    const fromAddress = getIntroductionFromAddress();
    const recipientName = introRecipientName(contact);
    const renderedHtml = template.render({
      recipientName,
      trackingId: contact.trackingId || "",
      unsubscribeUrl,
    });
    const sendToken = `intro-${String(contact._id)}`;

    let activity = await activityCollection.findOne({
      source: "intro",
      sendToken,
    });

    if (activity?.resendEmailId) {
      const sentAt = activity.sentAt || now;
      const introEmail = {
        ...(contact.introEmail || {}),
        status: "sent",
        sent: true,
        sentAt: new Date(sentAt).toISOString(),
        cancelledAt: null,
        resendEmailId: activity.resendEmailId,
        subject: template.subject,
        emailActivityId: String(activity._id),
      };

      await db.collection("contacts").updateOne(
        { _id: contact._id },
        {
          $set: {
            introEmail,
            updatedAt: new Date().toISOString(),
          },
        },
      );

      return Response.json({
        message: "Introduction email already sent",
        introEmail,
        resendEmailId: activity.resendEmailId,
        duplicatePrevented: true,
      });
    }

    if (!activity) {
      activity = createEmailActivityRecord({
        source: "intro",
        sendToken,
        contactId: contact._id,
        templateId: INTRO_TEMPLATE_ID,
        recipientEmail: email,
        recipientName,
        fromEmail: fromAddress,
        subject: template.subject,
        renderedHtml,
      });
      await activityCollection.insertOne(activity);
    } else {
      await activityCollection.updateOne(
        { _id: activity._id },
        {
          $set: {
            recipientEmail: email,
            recipientName,
            fromEmail: fromAddress,
            subject: template.subject,
            renderedHtml,
            status: "sending",
            failureMessage: null,
            updatedAt: new Date(),
          },
        },
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    let data = null;
    let sendError = null;

    try {
      const result = await resend.emails.send(
        {
          from: fromAddress,
          to: email,
          subject: template.subject,
          html: renderedHtml,
          headers: {
            "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          tags: [
            { name: "crm_type", value: "intro" },
            { name: "crm_email_id", value: String(activity._id) },
            { name: "contact_id", value: String(contact._id) },
          ],
        },
        {
          idempotencyKey: `crm-intro/${String(contact._id)}`,
        },
      );
      data = result.data;
      sendError = result.error;
    } catch (error) {
      await markEmailActivityFailed(activityCollection, activity._id, error);
      throw error;
    }

    if (sendError) {
      await markEmailActivityFailed(activityCollection, activity._id, sendError);
      console.error("Resend intro email error:", sendError);
      return Response.json(
        { error: sendError.message || "Failed to send introduction email" },
        { status: 500 },
      );
    }

    const sentAt = await markEmailActivitySent(
      activityCollection,
      activity._id,
      data?.id || null,
    );

    const introEmail = {
      ...(contact.introEmail || {}),
      status: "sent",
      sent: true,
      sentAt: sentAt.toISOString(),
      cancelledAt: null,
      resendEmailId: data?.id || null,
      subject: template.subject,
      emailActivityId: String(activity._id),
    };

    await db.collection("contacts").updateOne(
      { _id: contact._id },
      {
        $set: {
          introEmail,
          updatedAt: now.toISOString(),
        },
      },
    );

    return Response.json({
      message: "Introduction email sent",
      introEmail,
      resendEmailId: data?.id || null,
    });
  } catch (error) {
    console.error("Intro email route error:", error);
    return Response.json(
      { error: error.message || "Failed to update introduction email" },
      { status: 500 },
    );
  }
}
