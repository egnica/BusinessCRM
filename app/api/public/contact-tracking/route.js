import clientPromise from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRACKING_ID_PATTERN = /^NE-[A-HJ-NP-Z2-9]{8}$/;

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function validTrackingId(value) {
  return TRACKING_ID_PATTERN.test(String(value || "").trim());
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const trackingId = clean(url.searchParams.get("id"), 32);

    if (!validTrackingId(trackingId)) {
      return Response.json({ valid: false }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const contact = await db.collection("contacts").findOne(
      { trackingId },
      {
        projection: {
          firstName: 1,
          trackingId: 1,
        },
      },
    );

    if (!contact) {
      return Response.json({ valid: false }, { status: 404 });
    }

    return Response.json({
      valid: true,
      trackingId,
      firstName: clean(contact.firstName, 80),
    });
  } catch (error) {
    console.error("Contact tracking lookup error:", error);
    return Response.json(
      { error: "Tracking lookup failed." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const trackingId = clean(body?.trackingId, 32);
    const event = clean(body?.event, 80);

    if (!validTrackingId(trackingId)) {
      return Response.json({ valid: false }, { status: 400 });
    }

    if (event !== "adventure_win") {
      return Response.json(
        { error: "Unsupported tracking event." },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const contacts = db.collection("contacts");
    const contact = await contacts.findOne(
      { trackingId },
      {
        projection: {
          firstName: 1,
          trackingId: 1,
          tracking: 1,
        },
      },
    );

    if (!contact) {
      return Response.json({ valid: false }, { status: 404 });
    }

    const now = new Date().toISOString();
    const winCount = Number(contact.tracking?.adventureWins || 0) + 1;
    const sourcePath = clean(body?.sourcePath, 200);
    const utmSource = clean(body?.utmSource, 100);
    const utmMedium = clean(body?.utmMedium, 100);
    const utmCampaign = clean(body?.utmCampaign, 160);
    const referrer = clean(body?.referrer, 500);

    await Promise.all([
      contacts.updateOne(
        { _id: contact._id },
        {
          $inc: { "tracking.adventureWins": 1 },
          $set: {
            "tracking.lastAdventureWinAt": now,
            updatedAt: now,
          },
        },
      ),
      db.collection("contactActivity").insertOne({
        contactId: contact._id,
        trackingId,
        event,
        sourcePath,
        utmSource,
        utmMedium,
        utmCampaign,
        referrer,
        createdAt: now,
      }),
    ]);

    return Response.json({
      valid: true,
      trackingId,
      firstName: clean(contact.firstName, 80),
      winCount,
    });
  } catch (error) {
    console.error("Contact tracking event error:", error);
    return Response.json(
      { error: "Tracking event failed." },
      { status: 500 },
    );
  }
}
