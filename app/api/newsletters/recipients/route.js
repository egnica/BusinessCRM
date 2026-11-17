import { createHash } from "node:crypto";
import getMongoClient from "@/lib/mongodb";
import { CONTACT_REVIEW_PROJECTION, reviewNewsletterRecipients } from "@/lib/newsletterWorkflow.mjs";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const client = await getMongoClient();
    const contacts = await client.db("crm").collection("contacts")
      .find({}, { projection: CONTACT_REVIEW_PROJECTION }).toArray();
    const recipients = reviewNewsletterRecipients(contacts);
    return Response.json({ recipients, revision: createHash("sha256").update(JSON.stringify(recipients)).digest("hex") });
  } catch (error) {
    console.error("Newsletter recipient review error:", error);
    return Response.json({ error: "Could not load recipients. Retry before sending." }, { status: 500 });
  }
}
