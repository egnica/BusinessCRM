import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EMAIL_BASE_URL, getEmailBaseUrl } from "../lib/emailBaseUrl.mjs";

test("missing public URL uses the live CRM instead of the internal request origin", () => {
  assert.equal(getEmailBaseUrl({ appBaseUrl: "", nodeEnv: "production" }), DEFAULT_EMAIL_BASE_URL);
});

test("production recovers from configured localhost and loopback origins", () => {
  for (const appBaseUrl of [
    "https://localhost:3000", "http://localhost:3000", "https://LOCALHOST.:3000",
    "http://127.0.0.1:3000", "http://127.1:3000", "http://[::1]:3000",
    "http://0.0.0.0:3000", "http://app.localhost:3000", "http://crm.local:3000",
  ]) {
    assert.equal(getEmailBaseUrl({ appBaseUrl, nodeEnv: "production" }), DEFAULT_EMAIL_BASE_URL);
  }
});

test("configured public HTTPS origin is normalized and retained", () => {
  assert.equal(getEmailBaseUrl({ appBaseUrl: " https://crm.example.com/ ", nodeEnv: "production" }), "https://crm.example.com");
});

test("explicit local development URL is still supported", () => {
  assert.equal(getEmailBaseUrl({ appBaseUrl: "http://localhost:3000/", nodeEnv: "development" }), "http://localhost:3000");
});

test("invalid public settings fail before they can be used in a sent email", () => {
  for (const appBaseUrl of [
    "broken", "http://crm.example.com", "ftp://crm.example.com",
    "https://user:password@crm.example.com", "https://crm.example.com/subpath",
    "https://crm.example.com/?query=1", "https://crm.example.com/#fragment",
  ]) {
    assert.throws(() => getEmailBaseUrl({ appBaseUrl, nodeEnv: "production" }), /APP_BASE_URL/);
  }
});
