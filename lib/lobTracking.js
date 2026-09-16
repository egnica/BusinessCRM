const STATUS_LABELS = {
  submitted: "Submitted to Lob",
  created: "Accepted by Lob",
  rendered_pdf: "Prepared for production",
  mailed: "Mailed",
  in_transit: "In transit",
  in_local_area: "In local area",
  processed_for_delivery: "Processed for delivery",
  delivered: "Delivered",
  re_routed: "Re-routed",
  returned_to_sender: "Returned to sender",
  international_exit: "International exit",
  failed: "Failed",
  rejected: "Rejected",
  deleted: "Canceled",
};

const TRACKED_STATUSES = new Set(Object.keys(STATUS_LABELS));
const ATTENTION_STATUSES = new Set([
  "failed",
  "rejected",
  "returned_to_sender",
]);

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function dateValue(value) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusFromEventType(value) {
  const normalized = clean(value)
    .toLowerCase()
    .replace(/^letter\.(?:certified\.)?/, "")
    .replace(/^letter\./, "")
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");

  if (normalized === "processed" || normalized === "rendered") {
    return "submitted";
  }

  return TRACKED_STATUSES.has(normalized) ? normalized : "";
}

function formatLocation(location) {
  if (!location) return "";
  if (typeof location === "string") return clean(location);

  const city = clean(location.city || location.address_city);
  const state = clean(location.state || location.address_state);
  const zip = clean(
    location.zip_code || location.zip || location.address_zip,
  );

  return [city, state, zip].filter(Boolean).join(", ");
}

export function statusLabel(status) {
  return STATUS_LABELS[statusFromEventType(status) || status] || "Submitted to Lob";
}

export function statusTone(status) {
  const normalized = statusFromEventType(status) || "submitted";

  if (normalized === "delivered") return "success";
  if (ATTENTION_STATUSES.has(normalized)) return "danger";
  if (normalized === "re_routed") return "warning";
  if (normalized === "deleted") return "neutral";
  if (normalized === "submitted" || normalized === "created") return "neutral";
  return "progress";
}

export function normalizeTrackingEvent(event = {}, fallback = {}) {
  const eventType = clean(
    event.eventType ||
      event.event_type?.id ||
      fallback.eventType ||
      event.type ||
      event.name,
  );
  const status = statusFromEventType(
    fallback.status || eventType || event.type || event.name,
  );

  if (!status) return null;

  const occurredAt = clean(
    event.occurredAt ||
      event.time ||
      event.date_created ||
      fallback.occurredAt,
  );
  const location = formatLocation(event.location || fallback.location);
  const providerEventId = clean(
    event.providerEventId || event.id || fallback.providerEventId,
  );
  const key =
    providerEventId ||
    [status, occurredAt, location].filter(Boolean).join("|") ||
    status;

  return {
    key,
    providerEventId,
    eventType: eventType || `letter.${status}`,
    status,
    label: statusLabel(status),
    occurredAt,
    location,
    source: clean(event.source || fallback.source) || "lob",
  };
}

export function mergeTrackingEvents(existing = [], incoming = []) {
  const merged = new Map();

  for (const rawEvent of [...existing, ...incoming]) {
    const event = normalizeTrackingEvent(rawEvent);
    if (!event) continue;
    merged.set(event.key, event);
  }

  return [...merged.values()].sort((a, b) => {
    const dateDifference = dateValue(a.occurredAt) - dateValue(b.occurredAt);
    if (dateDifference) return dateDifference;
    return a.key.localeCompare(b.key);
  });
}

export function extractTrackingEventsFromLetter(letter = {}) {
  return mergeTrackingEvents(
    [],
    (letter.tracking_events || []).map((event) => ({
      ...event,
      source: "lob_api",
    })),
  );
}

export function extractTrackingEventsFromWebhook(payload = {}) {
  const eventType = clean(payload.event_type?.id || payload.event_type);
  const webhookStatus = statusFromEventType(eventType);
  const events = (payload.body?.tracking_events || []).map((event) => ({
    ...event,
    source: "lob_webhook",
  }));
  const normalizedEvents = mergeTrackingEvents([], events);

  if (
    webhookStatus &&
    !normalizedEvents.some((event) => event.status === webhookStatus)
  ) {
    normalizedEvents.push(
      normalizeTrackingEvent(
        {},
        {
          eventType,
          status: webhookStatus,
          occurredAt: payload.date_created,
          providerEventId: payload.id,
          source: "lob_webhook",
        },
      ),
    );
  }

  return mergeTrackingEvents([], normalizedEvents.filter(Boolean));
}

export function deriveTrackingSummary({
  trackingEvents = [],
  providerStatus = "",
  submittedAt = "",
} = {}) {
  const events = mergeTrackingEvents([], trackingEvents);
  const issueEvents = events.filter((event) =>
    ATTENTION_STATUSES.has(event.status),
  );
  const currentEvent = issueEvents.at(-1) || events.at(-1) || null;
  const currentStatus =
    currentEvent?.status || statusFromEventType(providerStatus) || "submitted";

  return {
    currentStatus,
    statusLabel: statusLabel(currentStatus),
    statusTone: statusTone(currentStatus),
    statusUpdatedAt: currentEvent?.occurredAt || submittedAt || "",
    attentionRequired: ATTENTION_STATUSES.has(currentStatus),
    trackingEvents: events,
  };
}
