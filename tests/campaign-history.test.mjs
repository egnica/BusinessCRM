import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignEngagementPipeline,
  campaignRecipientStatus,
  campaignRecipientActivityAt,
  sortCampaignRecipients,
} from "../lib/campaignHistory.mjs";

test("campaign counts group by email recipient before campaign totals", () => {
  const pipeline = campaignEngagementPipeline(["campaign1"]);
  assert.deepEqual(pipeline[0].$match.campaignId.$in, ["campaign1"]);
  assert.equal(pipeline[1].$group._id.recipientEmail.$toLower.$ifNull[0], "$recipientEmail");
  assert.deepEqual(pipeline[2].$group.openedCount, { $sum: "$opened" });
  assert.deepEqual(pipeline[2].$group.clickedCount, { $sum: "$clicked" });
});

test("recipient status honors unsubscribe and webhook activity", () => {
  assert.equal(campaignRecipientStatus({ status: "sent" }, { status: "clicked" }), "clicked");
  assert.equal(campaignRecipientStatus({ status: "sent" }, { status: "opened" }), "opened");
  assert.equal(campaignRecipientStatus({ status: "unsubscribed" }, { status: "clicked" }), "unsubscribed");
  assert.equal(campaignRecipientStatus({ status: "sent", unsubscribedAt: new Date() }, { status: "opened" }), "unsubscribed");
  assert.equal(campaignRecipientStatus({ status: "sent" }), "sent");
});


test("recipients sort by engagement, failures, unsubscribe, and delivery", () => {
  const recipients = [
    { email: "delivered@example.com", status: "delivered", lastActivityAt: "2026-10-16T19:00:00Z" },
    { email: "opened@example.com", status: "opened", lastActivityAt: "2026-10-16T18:00:00Z" },
    { email: "failed@example.com", status: "failed", lastActivityAt: "2026-10-16T19:00:00Z" },
    { email: "clicked@example.com", status: "clicked", lastActivityAt: "2026-10-16T10:00:00Z" },
    { email: "unsubscribed@example.com", status: "unsubscribed", lastActivityAt: "2026-10-16T19:00:00Z" },
    { email: "sent@example.com", status: "sent", lastActivityAt: "2026-10-16T20:00:00Z" },
    { email: "bounced@example.com", status: "bounced", lastActivityAt: "2026-10-16T18:00:00Z" },
    { email: "delayed@example.com", status: "delayed", lastActivityAt: "2026-10-16T17:00:00Z" },
  ];
  const ordered = sortCampaignRecipients(recipients);
  assert.deepEqual(ordered.map(({ email }) => email), [
    "clicked@example.com",
    "opened@example.com",
    "failed@example.com",
    "bounced@example.com",
    "delayed@example.com",
    "unsubscribed@example.com",
    "delivered@example.com",
    "sent@example.com",
  ]);
  assert.equal(recipients[0].email, "delivered@example.com", "must not mutate original list");
});

test("recent activity wins within the same status, then email breaks ties", () => {
  const recipients = [
    { status: "opened", email: "older@example.com", lastActivityAt: new Date("2026-10-15T18:00:00Z") },
    { status: "opened", email: "z@example.com", lastActivityAt: "2026-10-16T18:00:00Z" },
    { status: "opened", email: "a@example.com", lastActivityAt: "2026-10-16T18:00:00Z" },
    { status: "opened", email: "none@example.com" },
  ];
  assert.deepEqual(sortCampaignRecipients(recipients).map(({ email }) => email), [
    "a@example.com", "z@example.com", "older@example.com", "none@example.com",
  ]);
});

test("status timestamps control the recency order", () => {
  const activity = {
    eventTimestamps: { clickedAt: "2026-10-16T15:00:00Z", openedAt: "2026-10-16T14:00:00Z", deliveredAt: "2026-10-16T12:00:00Z" },
    lastEventAt: "2026-10-16T16:00:00Z",
  };
  assert.equal(campaignRecipientActivityAt({}, activity, "clicked"), "2026-10-16T15:00:00Z");
  assert.equal(campaignRecipientActivityAt({}, activity, "opened"), "2026-10-16T14:00:00Z");
  assert.equal(campaignRecipientActivityAt({}, activity, "delivered"), "2026-10-16T12:00:00Z");
  assert.equal(campaignRecipientActivityAt({ unsubscribedAt: "2026-10-16T17:00:00Z" }, activity, "unsubscribed"), "2026-10-16T17:00:00Z");
  assert.equal(campaignRecipientActivityAt({ sentAt: "2026-10-16T12:00:00Z" }, null, "sent"), "2026-10-16T12:00:00Z");
});
