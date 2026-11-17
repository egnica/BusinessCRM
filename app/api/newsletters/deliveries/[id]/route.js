import { ObjectId } from "mongodb";
import { Resend } from "resend";
import getMongoClient from "@/lib/mongodb";
import { processNewsletter, publicDelivery } from "@/lib/newsletterDelivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req, { params }) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) return Response.json({ error: "Invalid send ID." }, { status: 400 });
    const client = await getMongoClient();
    const send = await client.db("crm").collection("newsletterSends").findOne({ _id: new ObjectId(id), deliveryVersion: 2 });
    if (!send) return Response.json({ error: "Newsletter send not found." }, { status: 404 });
    return Response.json(publicDelivery(send));
  } catch {
    return Response.json({ error: "Could not check send progress. Retry connection." }, { status: 500 });
  }
}
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const { retryFailed = false } = await req.json();
    const client = await getMongoClient();
    return Response.json(await processNewsletter(client.db("crm"), id, new Resend(process.env.RESEND_API_KEY), { retryFailed: retryFailed === true }));
  } catch (error) {
    console.error("Newsletter delivery error:", error);
    return Response.json({ error: error.status ? error.message : "Connection interrupted. Resume this send to recover safely." }, { status: error.status || 500 });
  }
}
