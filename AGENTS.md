<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## CRM email tracking: critical rule for coding agents

All **live campaign emails** must receive each recipient's own CRM `contact.trackingId` (`NE-XXXXXXXX`) and preserve it in applicable first-party links. Never let a live campaign silently fall back to name-only personalized URLs or send without a valid tracking ID.

Before changing email templates, the campaign sender, or introduction-email sending, read:
- [`lib/emailTemplates/AGENTS.md`](lib/emailTemplates/AGENTS.md) for scoped implementation rules.
- [`lib/emailTemplates/README.md`](lib/emailTemplates/README.md) for the tracking flow, URL behavior, and verification steps.

Relevant code outside the template directory includes `app/api/newsletters/send/route.js`, `app/api/contacts/[id]/intro-email/route.js`, and the campaign preview/test APIs. Keep the server-side pre-send validation; use the shared helpers in `lib/emailTemplates/_trackingLinks.mjs`. Do not attach CRM tracking IDs to unsubscribe links, email addresses, or external sites.

When changing template rendering or email sending, run `node --test tests/email-template-tracking.test.mjs` and ideally `npm test`; report any tests you could not run. The tracking ID is an attribution identifier, **not authentication or proof of a human visit**.
