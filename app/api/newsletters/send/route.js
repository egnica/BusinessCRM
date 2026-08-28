import { Resend } from "resend";
import clientPromise from "@/lib/mongodb";
import { getEmailTemplate } from "@/lib/emailTemplates";
import { createUnsubscribeToken } from "@/lib/unsubscribe";

const BATCH_SIZE = 100;

export async function POST(req) {
  try {
    const { templateId, subject } = await req.json();
    const template = getEmailTemplate(templateId);

    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    if (
      !process.env.RESEND_API_KEY ||
      !process.env.RESEND_FROM_EMAIL ||
      !process.env.UNSUBSCRIBE_SECRET
    ) {
      return Response.json(
        { error: "Newsletter environment variables are not configured" },
        { status: 500 },
      );
    }

    const client = await clientPromise;
    const db = client.db("crm");

    const contacts = await db
      .collection("contacts")
      .find({
        email: { $type: "string", $ne: "" },
        emailStatus: { $ne: "unsubscribed" },
      })
      .toArray();

    const uniqueContacts = Array.from(
      new Map(
        contacts.map((contact) => [
          String(contact.email).trim().toLowerCase(),
          contact,
        ]),
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

    const sendResult = await db.collection("newsletterSends").insertOne({
      templateId: template.id,
      templateName: template.name,
      subject: finalSubject,
      sentAt: now,
      recipientCount: uniqueContacts.length,
      sentCount: 0,
      failedCount: 0,
      unsubscribeCount: 0,
      status: "sending",
      createdAt: now,
      updatedAt: now,
    });

    const sendId = sendResult.insertedId;
    const baseUrl = (process.env.APP_BASE_URL || new URL(req.url).origin).replace(
      /\/$/,
      "",
    );
    const resend = new Resend(process.env.RESEND_API_KEY);

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < uniqueContacts.length; i += BATCH_SIZE) {
      const chunk = uniqueContacts.slice(i, i + BATCH_SIZE);

      const messages = chunk.map((contact) => {
        const token = createUnsubscribeToken(contact._id, sendId);
        const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
        const recipientName =
          [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
          "there";

        return {
          from: process.env.RESEND_FROM_EMAIL,
          to: contact.email,
          subject: finalSubject,
          html: template.render({
            recipientName,
            unsubscribeUrl,
          }),
        };
      });

      const { data, error } = await resend.batch.send(messages);
      const responseItems = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : [];

      const recipientDocs = chunk.map((contact, index) => {
        const wasSent = !error;

        if (wasSent) sentCount += 1;
        else failedCount += 1;

        return {
          sendId,
          contactId: contact._id,
          email: String(contact.email).trim().toLowerCase(),
          recipientName:
            [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
            "",
          status: wasSent ? "sent" : "failed",
          resendEmailId: responseItems[index]?.id || null,
          error: error?.message || null,
          sentAt: wasSent ? new Date() : null,
          unsubscribedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      await db.collection("newsletterRecipients").insertMany(recipientDocs);
    }

    await db.collection("newsletterSends").updateOne(
      { _id: sendId },
      {
        $set: {
          sentCount,
          failedCount,
          status: failedCount === uniqueContacts.length ? "failed" : "complete",
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
    });
  } catch (error) {
    console.error("Newsletter send error:", error);
    return Response.json(
      { error: error.message || "Failed to send newsletter" },
      { status: 500 },
    );
  }
}
