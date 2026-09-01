import { ObjectId } from "mongodb";
import { Resend } from "resend";
import clientPromise from "@/lib/mongodb";
import { getEmailTemplate } from "@/lib/emailTemplates";
import {
  getNewsletterConfigStatus,
  getNewsletterFromAddress,
} from "@/lib/newsletterConfig";
import { createUnsubscribeToken } from "@/lib/unsubscribe";

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

    const client = await clientPromise;
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
      unsubscribeUrl: "#",
    });

    return Response.json({
      contactId: String(contact._id),
      recipientName: introRecipientName(contact),
      email: contact.email || "",
      emailStatus: contact.emailStatus || "unknown",
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

    const client = await clientPromise;
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

    if (contact.emailStatus !== "subscribed") {
      return Response.json(
        { error: "This contact is not subscribed to email" },
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

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: getNewsletterFromAddress(),
      to: email,
      subject: template.subject,
      html: template.render({
        recipientName: introRecipientName(contact),
        unsubscribeUrl,
      }),
      headers: {
        "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (error) {
      console.error("Resend intro email error:", error);
      return Response.json(
        { error: error.message || "Failed to send introduction email" },
        { status: 500 },
      );
    }

    const introEmail = {
      ...(contact.introEmail || {}),
      status: "sent",
      sent: true,
      sentAt: now.toISOString(),
      cancelledAt: null,
      resendEmailId: data?.id || null,
      subject: template.subject,
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
