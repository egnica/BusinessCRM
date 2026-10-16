export const TRACKING_ID_PATTERN = /^NE-[A-HJ-NP-Z2-9]{8}$/;

export function normalizeTrackingId(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return TRACKING_ID_PATTERN.test(normalized) ? normalized : "";
}

// Preserve existing campaign attribution query parameters and append the
// contact's CRM ID only to pages on the first-party website.
export function withTrackingId(url, trackingId) {
  const normalized = normalizeTrackingId(trackingId);
  if (!normalized) return url;

  const result = new URL(url);
  if (result.protocol !== "https:" ||
      !["nicholasegner.com", "www.nicholasegner.com"].includes(result.hostname)) {
    return url;
  }
  result.searchParams.set("id", normalized);
  return result.toString();
}

// This is the shared live campaign rendering contract. Without a valid ID,
// fail instead of silently falling back to a name-only personalized URL.
export function renderTrackedCampaignTemplate(template, contact, options) {
  const trackingId = normalizeTrackingId(contact?.trackingId);
  if (!trackingId) {
    throw new Error("Cannot send an untracked CRM campaign email.");
  }
  return template.render({ ...options, trackingId });
}
