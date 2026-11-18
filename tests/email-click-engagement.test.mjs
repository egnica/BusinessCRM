import assert from "node:assert/strict";
import test from "node:test";
import { classifyEmailClickEngagement } from "../lib/emailClickEngagement.mjs";

const delivery = "2026-11-17T17:00:00Z";
const burst = [
  { type: "email.clicked", link: "https://example.com/a", at: "2026-11-17T17:00:10Z" },
  { type: "email.clicked", link: "https://example.com/b", at: "2026-11-17T17:00:20Z" },
  { type: "email.clicked", link: "https://example.com/c", at: "2026-11-17T17:00:30Z" },
];

test("a rapid three-link burst after delivery is flagged as bot likely", () => {
  const result = classifyEmailClickEngagement({
    eventTimestamps: { deliveredAt: delivery }, events: burst,
  });
  assert.equal(result?.label, "Bot Likely");
  assert.equal(result?.suspected, true);
});

test("later clicks change the label without claiming a verified human", () => {
  const result = classifyEmailClickEngagement({
    eventTimestamps: { deliveredAt: delivery },
    events: [...burst, { type: "email.clicked", link: "https://example.com/a", at: "2026-11-17T17:06:00Z" }],
  });
  assert.equal(result?.label, "Later Engagement");
  assert.equal(result?.suspected, false);
  assert.match(result?.explanation, /not verified/);
});

test("three immediate requests for the same link are bot likely", () => {
  const events = [10, 11, 12].map((second) => ({
    type: "email.clicked", link: "https://example.com/unsubscribe",
    at: `2026-11-17T17:00:${second}Z`,
  }));
  const result = classifyEmailClickEngagement({ eventTimestamps: { deliveredAt: delivery }, events });
  assert.equal(result?.label, "Bot Likely");
  assert.match(result?.explanation, /same link/);
});

test("ordinary clicks and slower repeated links are not marked bot likely", () => {
  assert.equal(classifyEmailClickEngagement({ eventTimestamps: { deliveredAt: delivery }, events: burst.slice(0, 1) }), null);
  assert.equal(classifyEmailClickEngagement({
    eventTimestamps: { deliveredAt: delivery },
    events: burst.map((event) => ({ ...event, link: "https://example.com/a" })),
  }), null);
});
