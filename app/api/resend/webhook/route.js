import { ObjectId } from "mongodb";
import { Resend } from "resend";
import clientPromise from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_STATUS = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.failed": "failed",
  "email.complained": "complained",
  "email.suppressed": "suppressed",
};

const STATUS_PRIORITY = {
  sending: 0,
  sent: 10,
  delayed: 15,
  delivered: 20,
  opened: 30,
  clicked: 40,
  bounced: 100,
  failed: 100,
  suppressed: 100,
  complained: 110,
};

const TIMESTAMP_FIELD = {
  "email.sent": "sentAt",
  "email.delivered": "deliveredAt",
  "email.delivery_delayed": "delayedAt",
  "email.opened": "openedAt",
  "email.clicked": "clickedAt",
  "email.bounced": "bouncedAt",
  "email.failed": "failedAt",
  "email.complained": "complainedAt",
  "email.suppressed": "suppressedAt",
};

function getTag(data, name) {
  if (Array.isArray(data?.tags)) {
    return data.tags.find((tag) => tag?.name === name)?.value || "";
  }

  if (data?.tags && typeof data.tags === "object") {
    return data.tags[name] || "";
  }

  return "";
}

function eventDate(event) {
  const value = event?.created_at || event?.data?.created_at;
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function latestSummary(email) {
  return {
    emailId: String(email._id),
    subject: email.subject,
    status: email.status,
    sentAt: email.sentAt || null,
    deliveredAt: email.eventTimestamps?.deliveredAt || null,
    openedAt: email.eventTimestamps?.openedAt || null,
    clickedAt: email.eventTimestamps?.clickedAt || null,
    updatedAt: email.updatedAt || email.sentAt || null,
  };
}

export async function POST(req) {
  const webhookSecret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();

  if (!webhookSecret) {
    return Response.json(
      { error: "Resend webhook secret is not configured." },
      { status: 503 },
    );
  }

  const payload = await req.text();
  const svixId = req.headers.get("svix-id") || "";
  const svixTimestamp = req.headers.get("svix-timestamp") || "";
  const svixSignature = req.headers.get("svix-signature") || "";

  let event;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    event = await resend.webhooks.verify({
      payload,
      headers: {
        id: svixId,
        timestamp: svixTimestamp,
        signature: svixSignature,
      },
      webhookSecret,
    });
  } catch (error) {
    console.error("Invalid Resend webhook signature:", error);
    return Response.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const nextStatus = EVENT_STATUS[event?.type];

  if (!nextStatus) {
    return Response.json({ received: true, ignored: true });
  }

  try {
    const client = await clientPromise;
    const db = client.db("crm");
    const collection = db.collection("contactEmails");
    const resendEmailId = String(event?.data?.email_id || "").trim();
    const taggedRecordId = getTag(event?.data, "crm_email_id");

    let email = resendEmailId
      ? await collection.findOne({ resendEmailId })
      : null;

    if (!email && ObjectId.isValid(taggedRecordId)) {
      email = await collection.findOne({ _id: new ObjectId(taggedRecordId) });
    }

    if (!email) {
      return Response.json({ received: true, ignored: true });
    }

    if (svixId && email.webhookEventIds?.includes(svixId)) {
      return Response.json({ received: true, duplicate: true });
    }

    const at = eventDate(event);
    const timestampField = TIMESTAMP_FIELD[event.type];
    const currentPriority = STATUS_PRIORITY[email.status] ?? 0;
    const nextPriority = STATUS_PRIORITY[nextStatus] ?? 0;
    const status = nextPriority >= currentPriority ? nextStatus : email.status;
    const clickUrl =
      event?.data?.click?.link ||
      event?.data?.click?.url ||
      event?.data?.link ||
      null;

    const setFields = {
      status,
      updatedAt: at,
      lastEventType: event.type,
      lastEventAt: at,
    };

    if (resendEmailId && !email.resendEmailId) {
      setFields.resendEmailId = resendEmailId;
    }

    if (event?.data?.message_id) {
      setFields.messageId = event.data.message_id;
    }

    if (timestampField) {
      setFields[`eventTimestamps.${timestampField}`] = at;
    }

    const update = {
      $set: setFields,
      $push: {
        events: {
          id: svixId || null,
          type: event.type,
          at,
          link: clickUrl,
        },
      },
    };

    if (svixId) {
      update.$addToSet = { webhookEventIds: svixId };
    }

    const filter = { _id: email._id };
    if (svixId) filter.webhookEventIds = { $ne: svixId };

    const result = await collection.updateOne(filter, update);

    if (svixId && result.matchedCount === 0) {
      return Response.json({ received: true, duplicate: true });
    }

    const updatedEmail = await collection.findOne({ _id: email._id });

    if (updatedEmail?.contactId) {
      await db.collection("contacts").updateOne(
        {
          _id: updatedEmail.contactId,
          "latestHtmlEmail.emailId": String(updatedEmail._id),
        },
        {
          $set: {
            latestHtmlEmail: latestSummary(updatedEmail),
          },
        },
      );
    }

    return Response.json({
      received: true,
      emailId: String(email._id),
      status: updatedEmail?.status || status,
    });
  } catch (error) {
    console.error("Resend webhook processing error:", error);
    return Response.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
