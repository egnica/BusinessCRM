import clientPromise from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeLobEvent(event) {
  return {
    id: event.eventId || String(event._id),
    eventType: event.eventType || "letter.event",
    liveLetterId: event.liveLetterId || "",
    occurredAt: event.occurredAt || "",
    receivedAt: event.receivedAt || "",
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || 200);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 500)
      : 200;

    const client = await clientPromise;
    const db = client.db("crm");
    const lobCollection = db.collection("lobWebhookEvents");
    const emailCollection = db.collection("contactEmails");

    const [lobEvents, resendEvents, lobCount, resendCountResult] =
      await Promise.all([
        lobCollection
          .find({})
          .sort({ receivedAt: -1, _id: -1 })
          .limit(limit)
          .toArray(),
        emailCollection
          .aggregate([
            { $match: { "events.0": { $exists: true } } },
            { $unwind: "$events" },
            { $sort: { "events.at": -1, _id: -1 } },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                emailRecordId: { $toString: "$_id" },
                eventId: "$events.id",
                eventType: "$events.type",
                occurredAt: "$events.at",
                link: "$events.link",
                recipientName: 1,
                recipientEmail: 1,
                subject: 1,
                resendEmailId: 1,
                source: 1,
              },
            },
          ])
          .toArray(),
        lobCollection.countDocuments({}),
        emailCollection
          .aggregate([
            {
              $project: {
                count: { $size: { $ifNull: ["$events", []] } },
              },
            },
            { $group: { _id: null, total: { $sum: "$count" } } },
          ])
          .toArray(),
      ]);

    return Response.json({
      lob: lobEvents.map(serializeLobEvent),
      resend: resendEvents.map((event) => ({
        ...event,
        id:
          event.eventId ||
          `${event.emailRecordId}-${event.eventType}-${event.occurredAt || ""}`,
      })),
      totals: {
        lob: lobCount,
        resend: resendCountResult[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error("Integration logs error:", error);
    return Response.json(
      { error: "Could not load integration logs." },
      { status: 500 },
    );
  }
}
