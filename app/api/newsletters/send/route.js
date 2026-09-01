import { Resend } from "resend";
import clientPromise from "@/lib/mongodb";
import { getEmailTemplate } from "@/lib/emailTemplates";
import {
  getNewsletterConfigStatus,
  getNewsletterFromAddress,
} from "@/lib/newsletterConfig";
import { createUnsubscribeToken } from "@/lib/unsubscribe";

const BATCH_SIZE = 100;

function contactName(contact) {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    "there"
  );
}

export async function POST(req) {
  let db;
  let sendId;

  try {
    const { templateId, subject } = await req.json();
    const template = getEmailTemplate(templateId);

    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    const config = getNewsletterConfigStatus();

    if (!config.configured) {
      return Response.json(
        { error: "Newsletter environment variables are not configured" },
        { status: 500 },
      );
    }

    const client = await clientPromise;
    db = client.db("crm");

    const contacts = await db
      .collection("contacts")
      .find({
        email: { $type: "string", $ne: "" },
        emailStatus: "subscribed",
      })
      .toArray();

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
    const now = new Date();
    const baseUrl = (
      process.env.APP_BASE_URL || new URL(req.url).origin
    ).replace(/\/$/, "");

    const sendResult = await db.collection("newsletterSends").insertOne({
      templateId: template.id,
      templateName: template.name,
      subject: finalSubject,
      fromEmail: config.fromEmail,
      sentAt: now,
      recipientCount: uniqueContacts.length,
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

    for (let i = 0; i < uniqueContacts.length; i += BATCH_SIZE) {
      const chunk = uniqueContacts.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      const messages = chunk.map((contact) => {
        const token = createUnsubscribeToken(contact._id, sendId);
        const unsubscribeUrl =
          `${baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
        const oneClickUnsubscribeUrl =
          `${baseUrl}/api/newsletters/unsubscribe?token=${encodeURIComponent(token)}`;

        return {
          from: getNewsletterFromAddress(),
          to: contact.email,
          subject: finalSubject,
          html: template.render({
            recipientName: contactName(contact),
            unsubscribeUrl,
          }),
          headers: {
            "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        };
      });

      let data = null;
      let batchError = null;

      try {
        const result = await resend.batch.send(messages, {
          idempotencyKey: `newsletter-${String(sendId)}-batch-${batchNumber}`,
        });

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

      const recipientDocs = chunk.map((contact, index) => {
        const wasSent = !batchError;

        if (wasSent) sentCount += 1;
        else failedCount += 1;

        return {
          sendId,
          contactId: contact._id,
          email: contact.email,
          recipientName:
            [contact.firstName, contact.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() || "",
          status: wasSent ? "sent" : "failed",
          resendEmailId: responseItems[index]?.id || null,
          error: batchError?.message || null,
          sentAt: wasSent ? new Date() : null,
          unsubscribedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

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
      message: "Newsletter send complete",
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
