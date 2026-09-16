# CRM Webhook Receiver

This tiny Next.js app exists so Resend and Lob can deliver webhook events without exposing the password-protected CRM.

## Deploy

Deploy this folder (`webhook-receiver`) as a separate public Amplify app or other public Next.js deployment.

Required environment variables:

- `MONGODB_URI` — same MongoDB connection string used by the CRM
- `RESEND_WEBHOOK_SECRET` — signing secret from the Resend webhook
- `LOB_WEBHOOK_SECRET` — signing secret from the Lob webhook

Do not enable Amplify password/access control on this receiver app. Each POST route verifies the provider's request cryptographically before writing to MongoDB.

Health check:

`GET /api/resend/webhook`

Resend endpoint:

`POST https://<public-receiver-domain>/api/resend/webhook`

Lob health check:

`GET /api/lob/webhook`

Lob endpoint:

`POST https://<public-receiver-domain>/api/lob/webhook`
