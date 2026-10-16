import getMongoClient from "@/lib/mongodb";
import { campaignEngagementPipeline } from "@/lib/campaignHistory.mjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await getMongoClient();
    const db = client.db("crm");

    const sends = await db
      .collection("newsletterSends")
      .find({})
      .sort({ sentAt: -1 })
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

    const history = sends.map((send) => {
      const engagement = countsBySend.get(String(send._id));
      return {
        ...send,
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
