import getMongoClient from "@/lib/mongodb";
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";

export async function GET() {
  try {
    const client = await getMongoClient();
    const db = client.db("crm");

    const contactsCollection = db.collection("contacts");

    const contacts = await contactsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return Response.json({
      contacts: contacts.map((contact) => ({
        ...contact,
        emailStatus: contact.emailStatus || "subscribed",
      })),
    });
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
    // A stable key lets the browser safely retry an uncertain save, including
    // after refreshing. Other contact creation callers can omit the header.
    const requestId = req.headers.get("Idempotency-Key");
    if (requestId && !/^[a-f0-9-]{36}$/i.test(requestId)) {
      return Response.json({ error: "Invalid save request ID" }, { status: 400 });
    }
    delete body._id;
    delete body.createRequestHash;

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

    const client = await getMongoClient();
    const db = client.db("crm");

    const contact = {
      ...body,
      emailStatus: body.emailStatus || "subscribed",
    };

    const collection = db.collection("contacts");
    let insertedId;
    let savedContact;
    let replayed = false;
    if (requestId) {
      insertedId = new ObjectId(
        createHash("sha256").update(requestId).digest("hex").slice(0, 24),
      );
      const { createdAt: _createdAt, updatedAt: _updatedAt, ...content } = contact;
      const requestHash = createHash("sha256")
        .update(JSON.stringify(content))
        .digest("hex");
      let result;
      try {
        result = await collection.updateOne(
          { _id: insertedId },
          { $setOnInsert: { ...contact, createRequestHash: requestHash } },
          { upsert: true },
        );
      } catch (error) {
        // Concurrent retries can race on the unique _id. Read the winner.
        if (error.code !== 11000) throw error;
      }
      savedContact = await collection.findOne({ _id: insertedId });
      if (savedContact?.createRequestHash !== requestHash) {
        return Response.json(
          { error: "An earlier version of this contact was already saved. Your current draft is kept. Reload contacts to review the saved record before discarding this draft." },
          { status: 409 },
        );
      }
      replayed = !result?.upsertedCount;
    } else {
      const result = await collection.insertOne(contact);
      insertedId = result.insertedId;
      savedContact = { ...contact, _id: insertedId };
    }

    return Response.json(
      {
        message: "Contact created successfully",
        insertedId,
        contact: savedContact,
      },
      { status: replayed ? 200 : 201 },
    );
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Failed to create contact" },
      { status: 500 },
    );
  }
}
