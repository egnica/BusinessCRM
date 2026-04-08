import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const client = await clientPromise;
    const db = client.db("crm");

    delete body._id;

    const result = await db.collection("contacts").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...body,
          updatedAt: new Date().toISOString(),
        },
      },
    );

    return Response.json({
      message: "Contact updated successfully",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("PUT route error:", error);
    return Response.json(
      { error: "Failed to update contact" },
      { status: 500 },
    );
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params;

    const client = await clientPromise;
    const db = client.db("crm");

    const result = await db.collection("contacts").deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return Response.json({ error: "Contact not found" }, { status: 404 });
    }

    return Response.json({
      message: "Contact deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("DELETE route error:", error);
    return Response.json(
      { error: "Failed to delete contact" },
      { status: 500 },
    );
  }
}
