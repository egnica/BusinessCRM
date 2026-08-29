import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { lookupMetroPropertiesForProspect } from "@/lib/propertyOwnerSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeProspect(prospect) {
  return {
    ...prospect,
    _id: prospect._id?.toString?.() || prospect._id,
    crmContactId:
      prospect.crmContactId?.toString?.() || prospect.crmContactId || "",
  };
}

export async function POST(_request, { params }) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return Response.json({ error: "Invalid prospect ID" }, { status: 400 });
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

    const metroLookup = await lookupMetroPropertiesForProspect(prospect);
    const updatedAt = new Date().toISOString();

    await collection.updateOne(
      { _id: prospect._id },
      {
        $set: {
          metroLookup,
          updatedAt,
        },
      },
    );

    const updated = await collection.findOne({ _id: prospect._id });

    return Response.json({
      prospect: serializeProspect(updated),
      metroLookup,
    });
  } catch (error) {
    console.error("Metro property lookup error:", error);

    return Response.json(
      {
        error: "Failed to check metro properties",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
