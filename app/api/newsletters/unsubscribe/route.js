import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const token = new URL(req.url).searchParams.get("token");
    const decoded = verifyUnsubscribeToken(token);

    if (
      !decoded ||
      !ObjectId.isValid(decoded.contactId) ||
      !ObjectId.isValid(decoded.sendId)
    ) {
      return Response.json(
        { error: "This unsubscribe link is invalid." },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const contactId = new ObjectId(decoded.contactId);
    const sendId = new ObjectId(decoded.sendId);
    const now = new Date();

    const contact = await db
      .collection("contacts")
      .findOne({ _id: contactId });

    if (!contact) {
      return Response.json(
        { error: "We could not find this contact." },
        { status: 404 },
      );
    }

    const alreadyUnsubscribed = contact.emailStatus === "unsubscribed";

    if (!alreadyUnsubscribed) {
      await db.collection("contacts").updateOne(
        { _id: contactId },
        {
          $set: {
            emailStatus: "unsubscribed",
            unsubscribedAt: now,
            updatedAt: now,
          },
        },
      );
    }

    const recipientUpdate = await db
      .collection("newsletterRecipients")
      .updateOne(
        {
          sendId,
          contactId,
          unsubscribedAt: null,
        },
        {
          $set: {
            status: "unsubscribed",
            unsubscribedAt: now,
            updatedAt: now,
          },
        },
      );

    if (recipientUpdate.modifiedCount > 0) {
      await db.collection("newsletterSends").updateOne(
        { _id: sendId },
        {
          $inc: { unsubscribeCount: 1 },
          $set: { updatedAt: now },
        },
      );
    }

    return Response.json({
      success: true,
      alreadyUnsubscribed,
    });
  } catch (error) {
    console.error("Newsletter unsubscribe error:", error);

    return Response.json(
      { error: "We could not update your email preferences." },
      { status: 500 },
    );
  }
}
