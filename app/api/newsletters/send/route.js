import { EMAIL_REPLY_TO } from "@/lib/newsletterConfig";
import { ObjectId } from "mongodb";
import { Resend } from "resend";
import getMongoClient from "@/lib/mongodb";
import { getEmailBaseUrl } from "@/lib/emailBaseUrl.mjs";
import { getEmailTemplate } from "@/lib/emailTemplates";
import {
  getNewsletterConfigStatus,
  resolveNewsletterSender,
} from "@/lib/newsletterConfig";
import { createUnsubscribeToken } from "@/lib/unsubscribe";
import {
  createEmailActivityRecord,
  ensureEmailActivityIndexes,
  markEmailActivityFailed,
  markEmailActivitySent,
} from "@/lib/emailActivity";

const BATCH_SIZE = 100;

function contactName(contact) {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    "there"
  );
}

function subscribedEmailFilter() {
  return {
    email: { $type: "string", $ne: "" },
    // Preserve the legacy default formerly written by the contact GET route.
    $or: [
      { emailStatus: "subscribed" },
      { emailStatus: { $exists: false } },
      { emailStatus: null },
      { emailStatus: "" },
    ],
  };
}

function parseSelectedContactIds(contactIds) {
  if (!Array.isArray(contactIds)) return null;

  const ids = Array.from(
    new Set(contactIds.map((value) => String(value || "").trim()).filter(Boolean)),
  );

  if (ids.length === 0) {
    throw new Error("Select at least one contact before sending");
  }

  if (ids.some((id) => !ObjectId.isValid(id))) {
    throw new Error("One or more selected contacts are invalid");
  }

  return ids;
}

export async function POST(req) {
  let db;
  let sendId;

  try {
    const { templateId, subject, contactIds, campaignName, fromEmail } = await req.json();
    const template = getEmailTemplate(templateId);

    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    let selectedContactIds;
    try {
      selectedContactIds = parseSelectedContactIds(contactIds);
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    let sender;
    try {
      sender = resolveNewsletterSender(fromEmail);
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    const config = getNewsletterConfigStatus();

    if (!config.configured) {
      return Response.json(
        { error: "Newsletter environment variables are not configured" },
        { status: 500 },
      );
    }

    const client = await getMongoClient();
    db = client.db("crm");

    const query = subscribedEmailFilter();
    if (selectedContactIds) {
      query._id = {
        $in: selectedContactIds.map((id) => new ObjectId(id)),
      };
    }

    const contacts = await db.collection("contacts").find(query).toArray();

    if (selectedContactIds && contacts.length !== selectedContactIds.length) {
      return Response.json(
        {
          error:
            "One or more selected contacts cannot receive campaign email. Refresh the contact list and try again.",
        },
        { status: 400 },
      );
    }

    const uniqueContacts = Array.from(
      new Map(
        contacts
          .map((contact) => {
            const email = String(contact.email || "").trim().toLowerCase();
            return [email, { ...contact, email }];
          })
          .filter(([email]) => email),
      ).values(),
    );

    if (uniqueContacts.length === 0) {
      return Response.json(
        { error: "There are no subscribed contacts with email addresses" },
        { status: 400 },
      );
    }

    const finalSubject = subject?.trim() || template.subject;
    const finalCampaignName = String(campaignName || "").trim().slice(0, 200);
    const now = new Date();
    const baseUrl = getEmailBaseUrl();

    const sendResult = await db.collection("newsletterSends").insertOne({
      campaignName: finalCampaignName || null,
      sendType: selectedContactIds ? "selected" : "all-subscribers",
      templateId: template.id,
      templateName: template.name,
      subject: finalSubject,
      fromEmail: sender.email,
      replyTo: EMAIL_REPLY_TO,
      sentAt: now,
      recipientCount: uniqueContacts.length,
      selectedContactCount: selectedContactIds?.length || null,
      sentCount: 0,
      failedCount: 0,
      unsubscribeCount: 0,
      status: "sending",
      createdAt: now,
      updatedAt: now,
    });

    sendId = sendResult.insertedId;
    const resend = new Resend(process.env.RESEND_API_KEY);

    let sentCount = 0;
    let failedCount = 0;

    const activityCollection = db.collection("contactEmails");
    await ensureEmailActivityIndexes(activityCollection);

    for (let i = 0; i < uniqueContacts.length; i += BATCH_SIZE) {
      const chunk = uniqueContacts.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const fromAddress = sender.address;

      const prepared = chunk.map((contact) => {
        const token = createUnsubscribeToken(contact._id, sendId);
        const unsubscribeUrl =
          `${baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
        const oneClickUnsubscribeUrl =
          `${baseUrl}/api/newsletters/unsubscribe?token=${encodeURIComponent(token)}`;
        const recipientName = contactName(contact);
        const renderedHtml = template.render({
          recipientName,
          unsubscribeUrl,
        });
        const activity = createEmailActivityRecord({
          source: "campaign",
          sendToken: `campaign-${String(sendId)}-${String(contact._id)}`,
          contactId: contact._id,
          campaignId: sendId,
          templateId: template.id,
          recipientEmail: contact.email,
          recipientName,
          fromEmail: fromAddress,
          replyTo: EMAIL_REPLY_TO,
          subject: finalSubject,
          renderedHtml,
        });

        return {
          contact,
          activity,
          message: {
            from: fromAddress,
            replyTo: EMAIL_REPLY_TO,
            to: contact.email,
            subject: finalSubject,
            html: renderedHtml,
            headers: {
              "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            tags: [
              { name: "crm_type", value: "campaign" },
              { name: "crm_email_id", value: String(activity._id) },
              { name: "contact_id", value: String(contact._id) },
            ],
          },
        };
      });

      await activityCollection.insertMany(
        prepared.map((item) => item.activity),
      );

      let data = null;
      let batchError = null;

      try {
        const result = await resend.batch.send(
          prepared.map((item) => item.message),
          {
            idempotencyKey: `newsletter-${String(sendId)}-batch-${batchNumber}`,
          },
        );

        data = result.data;
        batchError = result.error;
      } catch (error) {
        batchError = error;
      }

      const responseItems = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : [];

      const recipientDocs = [];

      for (let index = 0; index < prepared.length; index += 1) {
        const { contact, activity } = prepared[index];
        const wasSent = !batchError;
        const resendEmailId = responseItems[index]?.id || null;

        if (wasSent) {
          sentCount += 1;
          await markEmailActivitySent(
            activityCollection,
            activity._id,
            resendEmailId,
          );
        } else {
          failedCount += 1;
          await markEmailActivityFailed(
            activityCollection,
            activity._id,
            batchError,
          );
        }

        recipientDocs.push({
          sendId,
          contactId: contact._id,
          email: contact.email,
          recipientName:
            [contact.firstName, contact.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() || "",
          status: wasSent ? "sent" : "failed",
          resendEmailId,
          emailActivityId: activity._id,
          error: batchError?.message || null,
          sentAt: wasSent ? new Date() : null,
          unsubscribedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      await db.collection("newsletterRecipients").insertMany(recipientDocs);
    }

    const finalStatus =
      sentCount === 0 ? "failed" : failedCount > 0 ? "partial" : "complete";

    await db.collection("newsletterSends").updateOne(
      { _id: sendId },
      {
        $set: {
          sentCount,
          failedCount,
          status: finalStatus,
          updatedAt: new Date(),
        },
      },
    );

    return Response.json({
      message: selectedContactIds
        ? "Campaign send complete"
        : "Newsletter send complete",
      sendId,
      recipientCount: uniqueContacts.length,
      sentCount,
      failedCount,
      status: finalStatus,
    });
  } catch (error) {
    console.error("Newsletter send error:", error);

    if (db && sendId) {
      try {
        await db.collection("newsletterSends").updateOne(
          { _id: sendId },
          {
            $set: {
              status: "failed",
              failureMessage: error.message || "Newsletter send failed",
              updatedAt: new Date(),
            },
          },
        );
      } catch (historyError) {
        console.error("Newsletter history update error:", historyError);
      }
    }

    return Response.json(
      { error: error.message || "Failed to send newsletter" },
      { status: 500 },
    );
  }
}

