import getMongoClient from "@/lib/mongodb";
import { prepareNewsletter } from "@/lib/newsletterDelivery";

export const runtime = "nodejs";
export async function POST(req) {
  try {
    const body = await req.json();
    const client = await getMongoClient();
    return Response.json(await prepareNewsletter(client.db("crm"), body));
  } catch (error) {
    console.error("Newsletter preparation error:", error);
    return Response.json({ error: error.status ? error.message : "Could not prepare newsletter. Your draft is saved; retry the same send." }, { status: error.status || 500 });
  }
}
