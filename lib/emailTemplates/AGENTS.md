# CRM email-template instructions for coding agents

**Read [README.md](README.md) before editing email templates.** This folder is part of an outreach system that attributes recipients and personalized website visits to CRM contact records.

## Non-negotiable tracking rules

1. CRM contacts have a `trackingId` formatted `NE-XXXXXXXX` (eight characters from the allowed alphabet; see `_trackingLinks.mjs`). Use the **contact's real trackingId**, not a new ID, an email address, or their first name.
2. Templates that contain links to `https://nicholasegner.com` or `https://www.nicholasegner.com` must accept `trackingId` in their `render({ recipientName, trackingId, unsubscribeUrl, ... })` arguments and call `withTrackingId(url, trackingId)` for those first-party HTTPS URLs. Preserve existing query parameters (including UTMs).
3. Personalized `/who-are-you` links must use `?id=NE-XXXXXXXX` when a valid ID is supplied. Do not substitute `?name=...` **for live sends**.
4. In `app/api/newsletters/send/route.js`, retain whole-batch validation via `normalizeTrackingId` **before** creating a send or sending anything. Render live campaign templates through `renderTrackedCampaignTemplate(template, contact, options)`; do not bypass this helper.
5. Keep other sending paths consistent: `app/api/contacts/[id]/intro-email/route.js` passes and validates the contact's ID; the preview and test routes can accept an *optional* explicit tracking ID for demos and must not falsely claim anonymous previews are attributed.
6. **Never alter unsubscribe URLs or append IDs to third-party links** using the CRM tracking helper. A tracking ID is a public attribution marker, not an authentication token.
7. Do not hand-edit the generated `index.js` as the source of truth. The `scripts/generate-email-template-index.mjs` script rebuilds it from template files on build. When adding a template, also extend tracking test coverage.

## Verification required for changes

- Run `node --test tests/email-template-tracking.test.mjs` and `npm test` when possible; say explicitly if validation couldn't be run.
- Render a template with a known valid test ID; verify each first-party link contains `id` and that UTM parameters survive.
- Verify unsubscribe links stay unchanged and the server refuses a live campaign if any intended recipient lacks a valid tracking ID.
- Do not imply that URL attribution proves the named person visited; links can be forwarded or opened by automated scanners.

See [README.md](README.md) for examples and current file locations.
