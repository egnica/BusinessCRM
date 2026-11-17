import getMongoClient from "@/lib/mongodb";
import { campaignEngagementPipeline } from "@/lib/campaignHistory.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await getMongoClient();
    const db = client.db("crm");

    const sends = await db
      .collection("newsletterSends")
      .find({}, { projection: { deliveryPlan: 0, requestHash: 0, lockToken: 0 } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const sendIds = sends.map((send) => send._id);
    const counts = sendIds.length
      ? await db.collection("contactEmails")
          .aggregate(campaignEngagementPipeline(sendIds))
          .toArray()
      : [];

    const countsBySend = new Map(
      counts.map((count) => [String(count._id), count]),
    );

    const scheduledSends = sends.filter((send) => send.deliveryVersion === 2 && send.scheduledAt);
    const liveCounts = scheduledSends.length ? await db.collection("contactEmails").aggregate([
      { $match: { campaignId: { $in: scheduledSends.map((send) => send._id) } } },
      { $group: { _id: "$campaignId",
        sentCount: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$eventTimestamps.sentAt", null] }, null] }, 1, 0] } },
        scheduledCount: { $sum: { $cond: [{ $eq: ["$status", "scheduled"] }, 1, 0] } },
      } },
    ]).toArray() : [];
    const liveBySend = new Map(liveCounts.map((count) => [String(count._id), count]));

    const history = sends.map((send) => {
      const engagement = countsBySend.get(String(send._id));
      return {
        ...send,
        ...(liveBySend.has(String(send._id)) ? {
          sentCount: liveBySend.get(String(send._id)).sentCount,
          scheduledCount: liveBySend.get(String(send._id)).scheduledCount,
        } : {}),
        openedCount: engagement?.openedCount ?? 0,
        clickedCount: engagement?.clickedCount ?? 0,
      };
    });

    return Response.json({ sends: history });
  } catch (error) {
    console.error("Newsletter history error:", error);
    return Response.json(
      { error: "Failed to load newsletter history" },
      { status: 500 },
    );
  }
}
