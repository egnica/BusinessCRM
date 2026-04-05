import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("crm");

    const contacts = await db.collection("contacts").find({}).toArray();

    return Response.json({ contacts });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Failed to fetch contacts" },
      { status: 500 },
    );
  }
}
