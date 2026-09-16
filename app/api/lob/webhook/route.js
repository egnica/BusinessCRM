import { createHmac, timingSafeEqual } from "crypto";
import clientPromise from "@/lib/mongodb";
import { extractTrackingEventsFromWebhook } from "@/lib/lobTracking";
import { applyLobTrackingUpdate } from "@/lib/lobTrackingStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function signatureCandidates(value) {
  return clean(value)
    .split(",")
    .map((part) => part.trim().replace(/^v\d+=/, ""))
    .filter(Boolean);
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function verifyLobSignature({ rawBody, signature, timestamp, secret }) {
  const timestampNumber = Number(timestamp);
  const timestampMilliseconds =
    timestampNumber > 1_000_000_000_000
      ? timestampNumber
      : timestampNumber * 1000;

  if (
    !Number.isFinite(timestampMilliseconds) ||
    Math.abs(Date.now() - timestampMilliseconds) >
      SIGNATURE_TOLERANCE_SECONDS * 1000
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return signatureCandidates(signature).some((candidate) =>
    secureEqual(candidate, expected),
  );
}

export async function GET() {
  return Response.json({ ok: true, service: "crm-lob-webhook" });
}

export async function POST(request) {
  const secret = clean(process.env.LOB_WEBHOOK_SECRET);

  if (!secret) {
    console.error("Lob webhook error: LOB_WEBHOOK_SECRET is not configured.");
    return Response.json(
      { error: "Lob webhook is not configured." },
      { status: 503 },
    );
  }

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("lob-signature");
    const timestamp = request.headers.get("lob-signature-timestamp");

    if (
      !signature ||
      !timestamp ||
      !verifyLobSignature({ rawBody, signature, timestamp, secret })
    ) {
      return Response.json(
        { error: "Invalid Lob webhook signature." },
        { status: 401 },
      );
    }

    const payload = JSON.parse(rawBody);
    const eventType = clean(payload.event_type?.id || payload.event_type);

    if (!eventType.startsWith("letter.")) {
      return Response.json({ received: true, ignored: true });
    }

    const liveLetterId = clean(payload.reference_id || payload.body?.id);

    if (!/^ltr_[A-Za-z0-9]+$/.test(liveLetterId)) {
      return Response.json(
        { error: "Webhook did not include a valid letter ID." },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const eventId = clean(payload.id);

    if (eventId) {
      await db.collection("lobWebhookEvents").updateOne(
        { eventId },
        {
          $setOnInsert: {
            eventId,
            eventType,
            liveLetterId,
            receivedAt: new Date().toISOString(),
            occurredAt: clean(payload.date_created),
          },
        },
        { upsert: true },
      );
    }

    const result = await applyLobTrackingUpdate(db, {
      liveLetterId,
      incomingEvents: extractTrackingEventsFromWebhook(payload),
      providerStatus: clean(payload.body?.status),
      sendDate: clean(payload.body?.send_date),
      expectedDeliveryDate: clean(payload.body?.expected_delivery_date),
    });

    return Response.json({
      received: true,
      eventType,
      matched: result.matchedRecords > 0,
    });
  } catch (error) {
    console.error("Lob webhook error:", error);
    return Response.json(
      { error: "Could not process Lob webhook." },
      { status: 400 },
    );
  }
}
