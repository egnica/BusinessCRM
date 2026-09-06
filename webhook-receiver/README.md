# CRM Resend Webhook Receiver

This tiny Next.js app exists so Resend can deliver webhook events without exposing the password-protected CRM.

## Deploy

Deploy this folder (`webhook-receiver`) as a separate public Amplify app or other public Next.js deployment.

Required environment variables:

- `MONGODB_URI` — same MongoDB connection string used by the CRM
- `RESEND_WEBHOOK_SECRET` — signing secret from the Resend webhook

Do not enable Amplify password/access control on this receiver app. The POST route verifies every Resend request cryptographically before writing to MongoDB.

Health check:

`GET /api/resend/webhook`

Resend endpoint:

`POST https://<public-receiver-domain>/api/resend/webhook`
