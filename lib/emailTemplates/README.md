# CRM Email Templates and Contact Tracking

This folder holds email templates used by the BusinessCRM outreach and campaign tools.

## Why tracking IDs matter

Each CRM contact has a unique `trackingId` such as `NE-7K4P9X2Q`. It connects the **recipient's CRM contact record** to a personalized first-party URL, rather than relying on a first name that many contacts may share.

Example personalized URL:

```text
https://nicholasegner.com/who-are-you?id=NE-7K4P9X2Q&utm_source=crm&utm_medium=email
```

The `id` query parameter can be consumed by website features that explicitly support it (for example, a personalized welcome/game experience). **Adding `id` to a URL alone does not implement website event tracking on every page.** A tracking ID is **not** a login, secret, or guarantee that the contact themselves clicked; security scanners and forwarded links exist.

Resend delivery/open/click events use their own email activity identifiers and webhook pipeline. Website attribution via `trackingId` is a related but separate mechanism. Do not confuse the two.

## Current flow

1. **Contact data:** `contacts.trackingId` is generated and backfilled by `app/api/contacts/route.js`; it uses the format `NE-` plus eight characters from the allowed alphabet.
2. **Live campaigns:** `app/api/newsletters/send/route.js` selects recipients, validates **every** recipient's ID *before creating a campaign send*, then calls `renderTrackedCampaignTemplate(template, contact, { recipientName, unsubscribeUrl })`.
3. **Template rendering:** That wrapper passes `contact.trackingId` to `template.render()`. Templates call `withTrackingId()` for first-party website links; the helper preserves existing query parameters such as UTM tags.
4. **Personalized landing:** The `/who-are-you` page can interpret `?id=...` and associate supported experiences with the CRM record.
5. **Other send/preview paths:** `app/api/contacts/[id]/intro-email/route.js` validates/passes the tracking ID for live introduction sends. `app/api/newsletters/preview/route.js` and `app/api/newsletters/test/route.js` support optional explicit test IDs. A preview without an ID is not a tracked live send.

The server intentionally rejects a **live campaign** when even one intended recipient has a missing or invalid tracking ID. Do not weaken or remove this all-or-nothing guard. Backfill/correct contact records before retrying.

## Template contract

Templates are regular modules exporting an object with `id`, `name`, `subject`, and `render()`. If you add or edit a template, give `render()` a `trackingId` argument, even if your current template includes only one website link.

```js
import { withTrackingId } from "./_trackingLinks.mjs";

const exampleTemplate = {
  id: "example-template",
  name: "Example Template",
  subject: "Hello",
  render({ recipientName = "there", trackingId = "", unsubscribeUrl = "#" } = {}) {
    const profileUrl = withTrackingId(
      "https://nicholasegner.com/video?utm_source=crm&utm_medium=email",
      trackingId,
    );

    // Escape user-provided values in real HTML templates.
    return `<p>Hello ${recipientName}</p>
      <a href="${profileUrl}">See my video work</a>
      <a href="${unsubscribeUrl}">Unsubscribe</a>`;
  },
};

export default exampleTemplate;
```

**For live campaign sending, do not call the template directly without the contact ID.** Use:

```js
import { renderTrackedCampaignTemplate } from "@/lib/emailTemplates/_trackingLinks.mjs";

const renderedHtml = renderTrackedCampaignTemplate(template, contact, {
  recipientName,
  unsubscribeUrl,
});
```

The shared module `_trackingLinks.mjs` exports:

- `normalizeTrackingId(value)`: uppercases/trims, validates `NE-XXXXXXXX`, returns `""` if invalid.
- `withTrackingId(url, trackingId)`: sets `id` on HTTPS URLs for `nicholasegner.com` / `www.nicholasegner.com` only; preserves other query parameters. It leaves external URLs and URLs with invalid IDs unchanged. **Do not use it for unsubscribe URLs.**
- `renderTrackedCampaignTemplate(template, contact, options)`: refuses to render an untracked live campaign email.

For tracked `/who-are-you` links, use `id` instead of the first-name-only `name` fallback. Never let an untracked fallback reach the live campaign sender.

## Existing templates and registration

The current template files are `introductionEmail.js`, `followUpClickEmail.js`, `videoOutreachEmail.js`, and `testNewsletter.js`.

`lib/emailTemplates/index.js` is **generated** by `scripts/generate-email-template-index.mjs`. The script scans `lib/emailTemplates` for template modules and runs during `npm run dev` and `npm run build`. Do not rely on manually editing the generated index; create your template file and regenerate the index.

Underscore-prefixed files such as `_trackingLinks.mjs` are deliberately excluded from registration.

## Testing before a send

Run:

```bash
node --test tests/email-template-tracking.test.mjs
npm test
```

Check that:

- The preview for a **selected contact** includes that contact's `id` on first-party website links, not just `?name=...`.
- Website links preserve UTM parameters and keep the ID after other query parameters.
- Every first-party link in each template includes the tracking ID; update `tests/email-template-tracking.test.mjs` when you introduce a new template.
- Unsubscribe links and off-site links are unchanged.
- A live campaign with any missing/invalid ID is blocked before sending any emails.
- Webhook delivery/open/click tracking still works independently.

**Note:** Emails already sent cannot be edited retroactively. Fixing a template only affects future sends.

See [AGENTS.md](AGENTS.md) for mandatory instructions for coding agents.
