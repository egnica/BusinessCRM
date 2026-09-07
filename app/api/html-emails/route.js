import crypto from "crypto";
import { ObjectId } from "mongodb";
import { Resend } from "resend";
import clientPromise from "@/lib/mongodb";
import { getNewsletterConfigStatus } from "@/lib/newsletterConfig";
import { renderHtmlEmailShell } from "@/lib/emailTemplates/_htmlEmailShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SUBJECT_LENGTH = 250;
const MAX_PREHEADER_LENGTH = 300;
const MAX_BODY_LENGTH = 100000;
const PERSONAL_FROM = "Nicholas Egner <nick@nicholasegner.com>";
const PERSONAL_REPLY_TO = String(
  process.env.RESEND_REPLY_TO_EMAIL || "nick@nicholasegner.com",
).trim();

function normalizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function serializeEmail(email) {
  return {
    ...email,
    _id: String(email._id),
    contactId: email.contactId ? String(email.contactId) : "",
    source: email.source || (email.contactId ? "contact" : "manual"),
  };
}

async function ensureIndexes(collection) {
  await Promise.all([
    collection.createIndex(
      { source: 1, sendToken: 1 },
      { unique: true, sparse: true, name: "source_send_token_unique" },
    ),
    collection.createIndex(
      { resendEmailId: 1 },
      { sparse: true, name: "resend_email_lookup" },
    ),
  ]);
}

async function markEmailFailed(collection, emailRecordId, error) {
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

function renderPersonalEmail(bodyHtml, preheader) {
  return renderHtmlEmailShell({ bodyHtml, preheader });
}

export async function GET(request) {
  try {
    const client = await clientPromise;
    const db = client.db("crm");
    const collection = db.collection("contactEmails");
    await ensureIndexes(collection);

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || 100);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 0), 250)
      : 100;
    const history = limit
      ? await collection
          .find({})
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray()
      : [];
    const config = getNewsletterConfigStatus();

    return Response.json({
      from: PERSONAL_FROM,
      replyTo: PERSONAL_REPLY_TO,
      resendConfigured: config.resendConfigured,
      configured: config.resendConfigured,
      webhookConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET),
      history: history.map(serializeEmail),
    });
  } catch (error) {
    console.error("HTML email history error:", error);
    return Response.json(
      { error: "Could not load HTML email history." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = String(body?.action || "");
    const subject = normalizeText(body?.subject, MAX_SUBJECT_LENGTH);
    const preheader = normalizeText(body?.preheader, MAX_PREHEADER_LENGTH);
    const bodyHtml = String(body?.bodyHtml || "").slice(0, MAX_BODY_LENGTH);

    if (!bodyHtml.trim()) {
      return Response.json(
        { error: "Add HTML content before previewing or sending." },
        { status: 400 },
      );
    }

    if (action !== "preview" && !subject) {
      return Response.json(
        { error: "Add a subject before sending." },
        { status: 400 },
      );
    }

    if (action === "preview") {
      return Response.json({
        html: renderPersonalEmail(bodyHtml, preheader),
      });
    }

    const config = getNewsletterConfigStatus();

    if (!config.resendConfigured) {
      return Response.json(
        { error: "Resend is not configured." },
        { status: 500 },
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    if (action === "test") {
      const testEmail = normalizeText(body?.testEmail, 320);

      if (!testEmail) {
        return Response.json(
          { error: "Enter the email address that should receive the test." },
          { status: 400 },
        );
      }

      const testToken =
        normalizeText(body?.sendToken, 120) || crypto.randomUUID();
      const { data, error } = await resend.emails.send(
        {
          from: PERSONAL_FROM,
          to: testEmail,
          replyTo: PERSONAL_REPLY_TO,
          subject: `[TEST] ${subject}`,
          html: renderPersonalEmail(bodyHtml, preheader),
          tags: [{ name: "crm_type", value: "html_email_test" }],
        },
        {
          idempotencyKey: `crm-html-test/${testToken}`,
        },
      );

      if (error) {
        console.error("Resend manual HTML email test error:", error);
        return Response.json(
          { error: error.message || "Test email failed." },
          { status: 500 },
        );
      }

      return Response.json({
        message: "Test email sent",
        resendEmailId: data?.id || null,
      });
    }

    if (action !== "send") {
      return Response.json(
        { error: "Unsupported HTML email action." },
        { status: 400 },
      );
    }

    const recipientEmail = normalizeText(body?.recipientEmail, 320);
    const recipientName = normalizeText(body?.recipientName, 250);

    if (!recipientEmail) {
      return Response.json(
        { error: "Enter the recipient email address." },
        { status: 400 },
      );
    }

    const sendToken = normalizeText(body?.sendToken, 120);

    if (!sendToken) {
      return Response.json(
        { error: "A send token is required." },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const collection = db.collection("contactEmails");
    await ensureIndexes(collection);

    let emailRecord = await collection.findOne({
      source: "manual",
      sendToken,
    });

    if (emailRecord?.resendEmailId) {
      return Response.json({
        message: "Email already sent",
        duplicatePrevented: true,
        email: serializeEmail(emailRecord),
      });
    }

    let emailRecordId = emailRecord?._id || new ObjectId();
    const now = new Date();
    const renderedHtml = renderPersonalEmail(bodyHtml, preheader);

    if (!emailRecord) {
      emailRecord = {
        _id: emailRecordId,
        source: "manual",
        sendToken,
        recipientEmail,
        recipientName,
        fromEmail: PERSONAL_FROM,
        replyTo: PERSONAL_REPLY_TO,
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
        createdAt: now,
        updatedAt: now,
      };

      try {
        await collection.insertOne(emailRecord);
      } catch (error) {
        if (error?.code !== 11000) throw error;
        emailRecord = await collection.findOne({
          source: "manual",
          sendToken,
        });
        emailRecordId = emailRecord?._id || emailRecordId;
      }
    }

    let data = null;
    let sendError = null;

    try {
      const result = await resend.emails.send(
        {
          from: PERSONAL_FROM,
          to: recipientEmail,
          replyTo: PERSONAL_REPLY_TO,
          subject,
          html: renderedHtml,
          tags: [
            { name: "crm_type", value: "html_email" },
            { name: "crm_email_id", value: String(emailRecordId) },
          ],
        },
        {
          idempotencyKey: `crm-html-email/manual/${sendToken}`,
        },
      );

      data = result.data;
      sendError = result.error;
    } catch (error) {
      await markEmailFailed(collection, emailRecordId, error);
      throw error;
    }

    if (sendError) {
      await markEmailFailed(collection, emailRecordId, sendError);
      console.error("Resend manual HTML email error:", sendError);
      return Response.json(
        { error: sendError.message || "HTML email failed." },
        { status: 500 },
      );
    }

    const sentAt = new Date();

    await collection.updateOne(
      { _id: emailRecordId },
      {
        $set: {
          resendEmailId: data?.id || null,
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
      {
        $set: { status: "sent" },
      },
    );

    const savedEmail = await collection.findOne({ _id: emailRecordId });

    return Response.json({
      message: "HTML email sent",
      email: serializeEmail(savedEmail),
      resendEmailId: data?.id || null,
    });
  } catch (error) {
    console.error("Manual HTML email route error:", error);
    return Response.json(
      { error: error.message || "HTML email request failed." },
      { status: 500 },
    );
  }
}
