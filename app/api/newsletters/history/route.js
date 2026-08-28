import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("crm");

    const sends = await db
      .collection("newsletterSends")
      .find({})
      .sort({ sentAt: -1 })
      .limit(50)
      .toArray();

    return Response.json({ sends });
  } catch (error) {
    console.error("Newsletter history error:", error);
    return Response.json(
      { error: "Failed to load newsletter history" },
      { status: 500 },
    );
  }
}
