import { campaignBlockedReason } from "./campaignEligibility.mjs";
import { normalizeTrackingId } from "./emailTemplates/_trackingLinks.mjs";

export const NEWSLETTER_DRAFT_KEY = "businessCrmNewsletterDraftV2";
export const CONTACT_REVIEW_PROJECTION = {
  firstName: 1, lastName: 1, ownerNameRaw: 1, email: 1,
  emailStatus: 1, trackingId: 1, "company.name": 1,
};

export function newsletterBlockedReason(contact) {
  if (String(contact?.emailStatus || "").trim().toLowerCase() === "unknown") {
    return "Not subscribed";
  }
  return campaignBlockedReason(contact);
}

export function reviewNewsletterRecipients(contacts) {
  const suppressed = new Set(contacts.filter((c) =>
    ["unsubscribed", "bounced", "complained", "suppressed"].includes(String(c.emailStatus || "").toLowerCase()),
  ).map((c) => String(c.email || "").trim().toLowerCase()).filter(Boolean));
  const seen = new Set();
  return [...contacts].sort((a, b) => String(a._id).localeCompare(String(b._id))).map((contact) => {
    const email = String(contact.email || "").trim().toLowerCase();
    let reason = newsletterBlockedReason(contact);
    if (!reason && suppressed.has(email)) reason = "Address opted out or blocked on another contact";
    if (!reason && seen.has(email)) reason = "Duplicate email address";
    if (!reason) seen.add(email);
    return {
      id: String(contact._id), email,
      name: [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || contact.ownerNameRaw || contact.company?.name || email || "Unnamed contact",
      company: contact.company?.name || "",
      trackingId: normalizeTrackingId(contact.trackingId),
      reason,
      eligible: !reason,
    };
  });
}

function dateParts(date, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
}

// Require an explicit IANA zone; reject missing and repeated DST wall times.
export function newsletterSchedule(localTime, timeZone, now = Date.now()) {
  if (!localTime) return null;
  if (typeof timeZone !== "string" || !timeZone) throw new Error("Choose a timezone.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localTime)) throw new Error("Choose a valid delivery date and time.");
  const nominal = Date.parse(`${localTime}:00Z`);
  if (!Number.isFinite(nominal)) throw new Error("Choose a valid delivery date and time.");
  const offsets = new Set();
  try {
    for (const hours of [-36, 0, 36]) {
      const point = new Date(nominal + hours * 3600000);
      const p = dateParts(point, timeZone);
      offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - point.getTime());
    }
  } catch { throw new Error("Choose a valid timezone."); }
  const matches = [...offsets].map((offset) => new Date(nominal - offset)).filter((date) => {
    const p = dateParts(date, timeZone);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === localTime;
  });
  if (matches.length !== 1) throw new Error("That time is skipped or repeated by daylight saving. Choose another time.");
  const scheduledAt = matches[0];
  if (scheduledAt.getTime() < now + 10 * 60000) throw new Error("Schedule at least 10 minutes ahead to allow time to queue the newsletter.");
  if (scheduledAt.getTime() > now + 30 * 86400000) throw new Error("Schedule within the next 30 days.");
  return scheduledAt.toISOString();
}

export function deliverySummary(send) {
  const tasks = send.deliveryPlan || [];
  const counts = { sentCount: 0, scheduledCount: 0, failedCount: 0, pendingCount: 0, reviewCount: 0, skippedCount: 0, cancelledCount: 0 };
  for (const task of tasks) {
    counts.skippedCount += task.skippedIds?.length || 0;
    const size = task.activeIds?.length ?? task.messages.length;
    if (task.state === "accepted") counts[send.scheduledAt ? "scheduledCount" : "sentCount"] += size;
    else if (task.state === "cancelled") counts.cancelledCount += size;
    else if (task.state === "failed") counts.failedCount += size;
    else if (task.state === "needs-review") counts.reviewCount += size;
    else if (task.state !== "skipped") counts.pendingCount += size;
  }
  return {
    ...counts,
    status: counts.pendingCount ? "sending" : counts.reviewCount ? "needs-review" : counts.failedCount ? "partial" : send.scheduledAt ? "scheduled" : "complete",
  };
}

export function readNewsletterDraft(storage) {
  const value = JSON.parse(storage.getItem(NEWSLETTER_DRAFT_KEY) || "null");
  return value && typeof value === "object" && typeof value.requestId === "string" ? value : null;
}

export function writeNewsletterDraft(storage, draft) {
  storage.setItem(NEWSLETTER_DRAFT_KEY, JSON.stringify(draft));
}
