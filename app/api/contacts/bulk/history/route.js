import getMongoClient from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await getMongoClient();
    const db = client.db("crm");
    const imports = await db.collection("contactImports")
      .find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    return Response.json({
      imports: imports.map((item) => ({
        batchId: item.batchId || String(item._id),
        fileName: item.fileName || "contacts.csv",
        status: item.status || "unknown",
        totalRows: item.totalRows || 0,
        duplicateMode: item.duplicateMode || "skip",
        createdAt: item.createdAt || null,
        completedAt: item.completedAt || null,
        importedCount: item.result?.importedCount || 0,
        updatedCount: item.result?.updatedCount || 0,
        skippedCount: item.result?.skippedCount || 0,
        errorCount: item.result?.errorCount || 0,
      })),
    });
  } catch (error) {
    console.error("Bulk import history error:", error);
    return Response.json({ error: "Could not load import history." }, { status: 500 });
  }
}
