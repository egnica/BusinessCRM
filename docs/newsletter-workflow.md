# Reviewed newsletter sends

The home-page **Send Newsletter** window now loads its audience from the server rather than trusting the directory's display count. It has Details, Recipients, and Preview tabs with a single scrolling content area.

- Choose `nick@nicholasegner.com`, `hello@nicholasegner.com`, or the configured sender. These addresses still require a verified sending domain in Resend.
- Inspect unique recipients, search, and exclude individual contacts. Invalid addresses, duplicates, opt-outs, and explicit unknown subscription statuses are excluded. Legacy blank statuses retain the existing subscribed default. An opted-out duplicate suppresses that address even when another record says subscribed.
- Drafts, exclusions, sender, subject, test contact, schedule, and the send's retry identity persist in this browser. Closing preserves the draft. Discard draft and New newsletter are explicit reset actions. Email history can recover started sends from another browser.
- Select a contact for real name/tracking-link personalization while sending the test only to the entered test address. Test unsubscribe links use `/newsletter-test`; they cannot unsubscribe a real contact. Live emails keep signed one-click unsubscribe headers and the recipient's CRM tracking ID.
- Scheduling uses Resend's individual-email scheduling API, with an explicit IANA timezone, at least 10 minutes ahead and at most 30 days ahead. Skipped/repeated DST times are rejected. Keep the window open until all messages are accepted into Resend's queue. Delivery after that point does not depend on a browser or an application cron job.
- The progress display distinguishes immediate sends, scheduled submissions, failures, skipped contacts, cancellation, and uncertain outcomes. It measures dispatch progress, not inbox delivery. History uses webhook activity for opens, clicks, and scheduled messages that have actually sent.

## Configuration

Required hosting environment variables: `RESEND_API_KEY` and `UNSUBSCRIBE_SECRET`. `RESEND_FROM_EMAIL` is optional because the approved default is `nick@nicholasegner.com`. The status API identifies missing configuration. Hosting environment changes require a redeploy. `APP_BASE_URL` controls the public URL used in unsubscribe links as documented in the root README.

Keep the existing Resend delivery/open/click webhook active. Both webhook receivers also recognize scheduled/cancelled statuses when provided. This change does not create webhooks or alter provider account settings.

## Delivery and recovery

- `GET /api/newsletters/recipients` returns an eligibility review and its revision hash.
- `POST /api/newsletters/deliveries` validates the review and every tracking ID, renders the entire newsletter, then atomically saves an immutable plan in `newsletterSends` (`deliveryVersion: 2`). A stable browser request ID produces the same database ID. Repeated preparation cannot create another send; changed content with that identity is rejected.
- `POST /api/newsletters/deliveries/:id` claims a short processing lease and dispatches one immediate batch (up to 100) or six individual scheduled messages per request. The client continues until complete, paused, or disconnected. Pending recipients require explicit Resume after reopening.
- Each request's payload, recipient/activity IDs, and provider idempotency key are persisted before the provider call. A lost response can be replayed with the exact same payload and key. Provider receipts are saved before activity reconciliation, so database write recovery does not re-contact Resend unnecessarily.
- Retry failed only starts new attempts only for explicitly rejected requests. Accepted groups are never retried. Ambiguous responses preserve the same key and pause. After 23 hours, uncertain requests require manual review in Resend instead of risking a resend after the provider's 24-hour idempotency retention window.
- Contacts are rechecked before dispatch. New opt-outs and changed addresses are skipped. Unsubscribing, changing a contact away from subscribed, or deleting a contact cancels confirmed provider-scheduled messages. Cancellation errors surface and can be retried; an acceptance/opt-out race is rechecked after scheduling. An uncertain provider outcome with changed recipient eligibility requires manual review and cancellation in Resend.
- A separate newsletter can intentionally reach the same recipients again after the explicit New newsletter confirmation. The draft identity protects retries, not all future campaigns with similar content.
- Scheduled sends freeze their recipient/content snapshot when queued. Later template edits do not alter queued messages. Rescheduling or cancelling an entire queued newsletter is available in the Resend dashboard; this UI currently handles queueing, opt-out cancellation, and recovery.

Full HTML plans are omitted from history and progress API responses. Plans are bounded below MongoDB's single-document limit; large audiences/templates receive a pre-send error requesting a smaller audience.

## Validation

`npm test`, `npm run lint`, and `npm run build`. Newsletter tests run the actual preparation/processing functions with simulated database and provider boundaries. They cover review exclusions, timezone/DST validation, whole-send tracking validation, concurrent preparation, lost responses, failed-only retries, incomplete receipts, expired duplicate protection, opt-outs, provider scheduling/cancellation, and draft recovery. No test sends live email.
