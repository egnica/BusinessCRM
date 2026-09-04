import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { getMailingContactName } from "@/lib/propertyOwnerSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = [
  "new",
  "interested",
  "not-interested",
  "archived",
];

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function serializeProspect(prospect) {
  return {
    ...prospect,
    mailingContactName: getMailingContactName(prospect),
    _id: prospect._id?.toString?.() || prospect._id,
    crmContactId:
      prospect.crmContactId?.toString?.() || prospect.crmContactId || "",
  };
}

export async function GET(_request, { params }) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return Response.json({ error: "Invalid prospect ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const prospect = await db
      .collection("propertyProspects")
      .findOne({ _id: new ObjectId(id) });

    if (!prospect) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    return Response.json({ prospect: serializeProspect(prospect) });
  } catch (error) {
    console.error("Property prospect fetch error:", error);

    return Response.json(
      { error: "Failed to load property prospect" },
      { status: 500 },
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return Response.json({ error: "Invalid prospect ID" }, { status: 400 });
    }

    const body = await request.json();
    const patch = {};

    if (body.status !== undefined) {
      if (!ALLOWED_STATUSES.includes(body.status)) {
        return Response.json(
          { error: "Invalid prospect status" },
          { status: 400 },
        );
      }

      patch.status = body.status;
      patch.archivedAt =
        body.status === "archived" ? new Date().toISOString() : null;
    }

    if (body.notes !== undefined) {
      patch.notes = String(body.notes || "");
    }

    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);

      if (email && !isValidEmail(email)) {
        return Response.json(
          { error: "Enter a valid email address" },
          { status: 400 },
        );
      }

      patch.email = email;
    }

    if (body.primaryParcelId !== undefined) {
      patch.primaryParcelId = String(body.primaryParcelId || "");
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const collection = db.collection("propertyProspects");
    const prospect = await collection.findOne({
      _id: new ObjectId(id),
    });

    if (!prospect) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    if (patch.primaryParcelId) {
      const primaryProperty = (prospect.properties || []).find(
        (property) => property.parcelId === patch.primaryParcelId,
      );

      if (!primaryProperty) {
        return Response.json(
          { error: "Selected property is not attached to this prospect" },
          { status: 400 },
        );
      }

      patch.primaryProperty = primaryProperty;
    }

    patch.updatedAt = new Date().toISOString();

    await collection.updateOne(
      { _id: prospect._id },
      { $set: patch },
    );

    const updated = await collection.findOne({ _id: prospect._id });

    return Response.json({
      prospect: serializeProspect(updated),
    });
  } catch (error) {
    console.error("Property prospect update error:", error);

    return Response.json(
      { error: "Failed to update property prospect" },
      { status: 500 },
    );
  }
}


export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return Response.json({ error: "Invalid prospect ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const result = await db
      .collection("propertyProspects")
      .deleteOne({ _id: new ObjectId(id) });

    if (!result.deletedCount) {
      return Response.json({ error: "Prospect not found" }, { status: 404 });
    }

    return Response.json({
      deletedCount: 1,
      deletedProspectId: id,
    });
  } catch (error) {
    console.error("Property prospect delete error:", error);

    return Response.json(
      { error: "Failed to delete property prospect" },
      { status: 500 },
    );
  }
}
