import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";

export async function GET(_req, { params }) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return Response.json({ error: "Invalid send id" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const sendId = new ObjectId(id);

    const [send, recipients] = await Promise.all([
      db.collection("newsletterSends").findOne({ _id: sendId }),
      db
        .collection("newsletterRecipients")
        .find({ sendId })
        .sort({ email: 1 })
        .toArray(),
    ]);

    if (!send) {
      return Response.json({ error: "Newsletter send not found" }, { status: 404 });
    }

    return Response.json({ send, recipients });
  } catch (error) {
    console.error("Newsletter detail error:", error);
    return Response.json(
      { error: "Failed to load newsletter details" },
      { status: 500 },
    );
  }
}
