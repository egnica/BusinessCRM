import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function PUT(req, { params }) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return Response.json(
        {
          error: "Invalid contact ID",
          id,
        },
        { status: 400 },
      );
    }

    const body = await req.json();

    // MongoDB will not allow _id to be changed
    delete body._id;

    const client = await clientPromise;
    const db = client.db("crm");

    const result = await db.collection("contacts").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...body,
          updatedAt: new Date().toISOString(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return Response.json(
        {
          error: "Contact not found",
          id,
        },
        { status: 404 },
      );
    }

    return Response.json({
      message: "Contact updated successfully",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("PUT route error:", error);

    return Response.json(
      {
        error: "Failed to update contact",
        details: error.message,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return Response.json(
        {
          error: "Invalid contact ID",
          id,
        },
        { status: 400 },
      );
    }

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
      {
        error: "Failed to delete contact",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
