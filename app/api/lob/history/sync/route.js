import clientPromise from "@/lib/mongodb";
import { extractTrackingEventsFromLetter } from "@/lib/lobTracking";
import { applyLobTrackingUpdate } from "@/lib/lobTrackingStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOB_API_BASE = "https://api.lob.com/v1";
const MAX_SYNCED_LETTERS = 100;

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function authHeader(apiKey) {
  return "Basic " + Buffer.from(apiKey + ":").toString("base64");
}

async function syncLetter(db, apiKey, liveLetterId) {
  const response = await fetch(
    `${LOB_API_BASE}/letters/${encodeURIComponent(liveLetterId)}`,
    {
      cache: "no-store",
      headers: { Authorization: authHeader(apiKey) },
    },
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data?.error?.message || `Lob returned ${response.status}.`,
    );
  }

  const letter = await response.json();
  const trackingEvents = extractTrackingEventsFromLetter(letter);
  await applyLobTrackingUpdate(db, {
    liveLetterId,
    incomingEvents: trackingEvents,
    providerStatus: clean(letter.status),
    sendDate: clean(letter.send_date),
    expectedDeliveryDate: clean(letter.expected_delivery_date),
  });

  return { trackingEventCount: trackingEvents.length };
}

async function runWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        const value = await task(items[index]);
        results[index] = { ok: true, id: items[index], ...value };
      } catch (error) {
        results[index] = {
          ok: false,
          id: items[index],
          error: error.message,
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

export async function POST() {
  try {
    const apiKey = clean(process.env.LOB_LIVE_API_KEY);

    if (!apiKey || !apiKey.startsWith("live_") || apiKey.startsWith("live_pub_")) {
      return Response.json(
        { error: "LOB_LIVE_API_KEY is not configured correctly." },
        { status: 500 },
      );
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const [centralLetters, prospects] = await Promise.all([
      db
        .collection("letterHistory")
        .find(
          { environment: "live", liveLetterId: { $exists: true } },
          { projection: { liveLetterId: 1, submittedAt: 1 } },
        )
        .sort({ submittedAt: -1 })
        .limit(MAX_SYNCED_LETTERS)
        .toArray(),
      db
        .collection("propertyProspects")
        .find(
          { "mailHistory.environment": "live" },
          { projection: { mailHistory: 1 } },
        )
        .toArray(),
    ]);
    const ids = new Set(
      centralLetters.map((letter) => clean(letter.liveLetterId)).filter(Boolean),
    );

    for (const prospect of prospects) {
      for (const letter of prospect.mailHistory || []) {
        if (letter?.environment === "live" && letter?.liveLetterId) {
          ids.add(clean(letter.liveLetterId));
        }
      }
    }

    const liveLetterIds = [...ids].slice(0, MAX_SYNCED_LETTERS);
    const results = await runWithConcurrency(
      liveLetterIds,
      6,
      (liveLetterId) => syncLetter(db, apiKey, liveLetterId),
    );
    const failures = results.filter((result) => !result.ok);
    const checked = results.length - failures.length;
    const withTrackingHistory = results.filter(
      (result) => result.ok && result.trackingEventCount > 0,
    ).length;

    return Response.json({
      checked,
      withTrackingHistory,
      synced: checked,
      failed: failures.length,
      failures,
    });
  } catch (error) {
    console.error("Lob history sync error:", error);
    return Response.json(
      { error: "Could not sync letter history with Lob." },
      { status: 500 },
    );
  }
}
