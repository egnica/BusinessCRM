import assert from "node:assert/strict";
import test from "node:test";
import introductionEmail from "../lib/emailTemplates/introductionEmail.js";
import followUpClickEmail from "../lib/emailTemplates/followUpClickEmail.js";
import videoOutreachEmail from "../lib/emailTemplates/videoOutreachEmail.js";
import testNewsletter from "../lib/emailTemplates/testNewsletter.js";
import {
  normalizeTrackingId,
  withTrackingId,
  renderTrackedCampaignTemplate,
} from "../lib/emailTemplates/_trackingLinks.mjs";

const trackingId = "NE-7K4P9X2Q";
const unsubscribeUrl = "https://crm.example.com/unsubscribe?token=abc";
const contact = { trackingId };

test("tracking ID normalization rejects invalid identifiers", () => {
  assert.equal(normalizeTrackingId(" ne-7k4p9x2q "), trackingId);
  assert.equal(normalizeTrackingId("NE-INVALID"), "");
  assert.equal(normalizeTrackingId(""), "");
});

test("adding tracking ID preserves existing campaign parameters", () => {
  const url = withTrackingId(
    "https://nicholasegner.com/video?utm_source=crm&utm_campaign=video_outreach",
    trackingId,
  );
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("id"), trackingId);
  assert.equal(parsed.searchParams.get("utm_campaign"), "video_outreach");
  assert.equal(withTrackingId(unsubscribeUrl, trackingId), unsubscribeUrl);
});

test("every registered template carries the CRM ID in first-party links", () => {
  const templates = [
    introductionEmail,
    followUpClickEmail,
    videoOutreachEmail,
    testNewsletter,
  ];
  for (const template of templates) {
    const html = renderTrackedCampaignTemplate(template, contact, {
      recipientName: "Joshua Fox",
      unsubscribeUrl,
    });
    const links = Array.from(html.matchAll(/href="([^"]+)"/g))
      .map((match) => match[1].replaceAll("&amp;", "&"));
    const firstPartyLinks = links.filter((link) => link.startsWith("https://nicholasegner.com/"));
    assert.ok(firstPartyLinks.length > 0, template.id + " missing first-party links");
    for (const link of firstPartyLinks) {
      assert.equal(new URL(link).searchParams.get("id"), trackingId, template.id + ": " + link);
    }
    assert.ok(html.includes(unsubscribeUrl.replaceAll("&", "&amp;")), template.id + " lost unsubscribe");
  }
});

test("personalized introductions use id instead of name for tracked campaigns", () => {
  for (const template of [introductionEmail, followUpClickEmail]) {
    const html = renderTrackedCampaignTemplate(template, contact, {
      recipientName: "Joshua Fox",
      unsubscribeUrl,
    });
    assert.match(html, /who-are-you\?id=NE-7K4P9X2Q/);
    assert.doesNotMatch(html, /who-are-you\?name=Joshua/);
  }
});

test("live campaigns never silently send name-only personalized links", () => {
  assert.throws(
    () => renderTrackedCampaignTemplate(followUpClickEmail, { trackingId: "" }, {
      recipientName: "Joshua Fox",
      unsubscribeUrl,
    }),
    /untracked/,
  );
});
