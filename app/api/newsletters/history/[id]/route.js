import { ObjectId } from "mongodb";
import getMongoClient from "@/lib/mongodb";
import { campaignRecipientStatus } from "@/lib/campaignHistory.mjs";

export const dynamic = "force-dynamic";

export async function GET(_req, { params }) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return Response.json({ error: "Invalid send id" }, { status: 400 });
    }

    const client = await getMongoClient();
    const db = client.db("crm");
    const sendId = new ObjectId(id);

    const [send, recipients] = await Promise.all([
      db.collection("newsletterSends").findOne({ _id: sendId }),
      db.collection("newsletterRecipients")
        .find({ sendId })
        .sort({ email: 1 })
        .toArray(),
    ]);

    if (!send) {
      return Response.json({ error: "Newsletter send not found" }, { status: 404 });
    }

    const activityIds = recipients
      .map((recipient) => recipient.emailActivityId)
      .filter((id) => id && ObjectId.isValid(String(id)))
      .map((id) => new ObjectId(String(id)));
    const resendIds = recipients
      .map((recipient) => recipient.resendEmailId)
      .filter(Boolean);

    const conditions = [{ campaignId: sendId }];
    if (activityIds.length) conditions.push({ _id: { $in: activityIds } });
    if (resendIds.length) conditions.push({ resendEmailId: { $in: resendIds } });

    const activities = await db.collection("contactEmails")
      .find({ $or: conditions })
      .project({
        campaignId: 1, contactId: 1, recipientEmail: 1, resendEmailId: 1,
        status: 1, eventTimestamps: 1,
      })
      .toArray();

    const byId = new Map(activities.map((activity) => [String(activity._id), activity]));
    const byResendId = new Map(
      activities.filter((activity) => activity.resendEmailId)
        .map((activity) => [activity.resendEmailId, activity]),
    );
    const byCampaignEmail = new Map(
      activities.filter((activity) => String(activity.campaignId) === String(sendId))
        .map((activity) => [String(activity.recipientEmail || "").toLowerCase(), activity]),
    );

    const currentRecipients = recipients.map((recipient) => {
      const activity = byId.get(String(recipient.emailActivityId || "")) ||
        byResendId.get(recipient.resendEmailId) ||
        byCampaignEmail.get(String(recipient.email || "").toLowerCase());

      return {
        ...recipient,
        contactId: recipient.contactId || activity?.contactId || null,
        status: campaignRecipientStatus(recipient, activity),
        openedAt: activity?.eventTimestamps?.openedAt || null,
        clickedAt: activity?.eventTimestamps?.clickedAt || null,
      };
    });

    return Response.json({ send, recipients: currentRecipients });
  } catch (error) {
    console.error("Newsletter detail error:", error);
    return Response.json(
      { error: "Failed to load newsletter details" },
      { status: 500 },
    );
  }
}
