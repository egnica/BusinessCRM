import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("crm");

    const contactsCollection = db.collection("contacts");

    await contactsCollection.updateMany(
      {
        $or: [
          { emailStatus: { $exists: false } },
          { emailStatus: null },
          { emailStatus: "" },
        ],
      },
      {
        $set: { emailStatus: "subscribed" },
      },
    );

    const contacts = await contactsCollection
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

    const isEntity = body.ownerType === "llc";
    const hasPersonName = Boolean(body.firstName?.trim() && body.lastName?.trim());
    const hasEntityName = Boolean(body.company?.name?.trim());

    if ((isEntity && !hasEntityName) || (!isEntity && !hasPersonName)) {
      return Response.json(
        {
          error: isEntity
            ? "LLC / entity name is required"
            : "First name and last name are required",
        },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db("crm");

    const contact = {
      ...body,
      emailStatus: body.emailStatus || "subscribed",
    };

    const result = await db.collection("contacts").insertOne(contact);

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
