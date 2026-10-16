import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignEngagementPipeline,
  campaignRecipientStatus,
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
