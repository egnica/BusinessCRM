import getMongoClient from "@/lib/mongodb";
import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";


const TRACKING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TRACKING_LENGTH = 8;
const MISSING_TRACKING_FILTER = {
  $or: [
    { trackingId: { $exists: false } },
    { trackingId: null },
    { trackingId: "" },
  ],
};

let trackingIndexPromise;

function createTrackingId() {
  const bytes = randomBytes(TRACKING_LENGTH);
  let value = "NE-";

  for (let index = 0; index < TRACKING_LENGTH; index += 1) {
    value += TRACKING_ALPHABET[bytes[index] % TRACKING_ALPHABET.length];
  }

  return value;
}

function ensureTrackingIdIndex(collection) {
  if (!trackingIndexPromise) {
    trackingIndexPromise = collection
      .createIndex(
        { trackingId: 1 },
        {
          unique: true,
          name: "trackingId_unique",
          partialFilterExpression: { trackingId: { $type: "string" } },
        },
      )
      .catch((error) => {
        trackingIndexPromise = null;
        throw error;
      });
  }

  return trackingIndexPromise;
}

async function backfillMissingTrackingIds(collection) {
  const missing = await collection
    .find(MISSING_TRACKING_FILTER, { projection: { _id: 1 } })
    .toArray();

  for (const contact of missing) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const result = await collection.updateOne(
          { _id: contact._id, ...MISSING_TRACKING_FILTER },
          { $set: { trackingId: createTrackingId() } },
        );

        if (result.modifiedCount || !result.matchedCount) break;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
  }
}

async function insertWithTrackingId(collection, contact) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const trackingId = createTrackingId();

    try {
      const result = await collection.insertOne({ ...contact, trackingId });
      return {
        result,
        contact: { ...contact, trackingId, _id: result.insertedId },
      };
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  throw new Error("Could not generate a unique tracking ID.");
}

async function upsertWithTrackingId(
  collection,
  insertedId,
  contact,
  requestHash,
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await collection.updateOne(
        { _id: insertedId },
        {
          $setOnInsert: {
            ...contact,
            trackingId: createTrackingId(),
            createRequestHash: requestHash,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;

      const existing = await collection.findOne(
        { _id: insertedId },
        { projection: { _id: 1 } },
      );

      if (existing) return null;
    }
  }

  throw new Error("Could not generate a unique tracking ID.");
}

export async function GET() {
  try {
    const client = await getMongoClient();
    const db = client.db("crm");

    const contactsCollection = db.collection("contacts");

    await ensureTrackingIdIndex(contactsCollection);
    await backfillMissingTrackingIds(contactsCollection);

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
    delete body.trackingId;

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
    await ensureTrackingIdIndex(collection);

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
      const result = await upsertWithTrackingId(
        collection,
        insertedId,
        contact,
        requestHash,
      );
      savedContact = await collection.findOne({ _id: insertedId });
      if (savedContact?.createRequestHash !== requestHash) {
        return Response.json(
          { error: "An earlier version of this contact was already saved. Your current draft is kept. Reload contacts to review the saved record before discarding this draft." },
          { status: 409 },
        );
      }
      replayed = !result?.upsertedCount;
    } else {
      const inserted = await insertWithTrackingId(collection, contact);
      insertedId = inserted.result.insertedId;
      savedContact = inserted.contact;
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
