import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("crm");

    const contacts = await db
      .collection("contacts")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return Response.json({ contacts });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Failed to fetch contacts" },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    if (!body.firstName || !body.lastName) {
      return Response.json(
        { error: "First name and last name are required" },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db("crm");

    const result = await db.collection("contacts").insertOne(body);

    return Response.json(
      {
        message: "Contact created successfully",
        insertedId: result.insertedId,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Failed to create contact" },
      { status: 500 },
    );
  }
}
