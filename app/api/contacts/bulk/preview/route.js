import getMongoClient from "@/lib/mongodb";
import {
  addContactToDuplicateIndex,
  applyAdditionalImportFields,
  createDuplicateIndex,
  findDuplicateContact,
  normalizeImportRow,
} from "@/lib/contactImport.mjs";

const MAX_ROWS = 2500;

export async function POST(req) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const additionalFields = body.additionalFields;

    if (!rows.length) {
      return Response.json({ error: "No contact rows were provided." }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return Response.json({ error: "CSV imports are limited to " + MAX_ROWS + " rows at a time." }, { status: 400 });
    }

    const client = await getMongoClient();
    const db = client.db("crm");
    const existing = await db.collection("contacts").find(
      {},
      {
        projection: {
          firstName: 1,
          lastName: 1,
          ownerType: 1,
          email: 1,
          phone: 1,
          linkedin: 1,
          "company.name": 1,
        },
      },
    ).toArray();

    const duplicateIndex = createDuplicateIndex(existing);
    const previewRows = rows.map((row, index) => {
      const { contact, errors } = normalizeImportRow(applyAdditionalImportFields(row, additionalFields));
      const duplicate = errors.length ? null : findDuplicateContact(contact, duplicateIndex);

      if (!errors.length) {
        addContactToDuplicateIndex(duplicateIndex, contact, {
          source: "file",
          rowIndex: index,
          id: "file:" + index,
        });
      }

      return {
        rowNumber: index + 2,
        status: errors.length ? "invalid" : duplicate ? "duplicate" : "ready",
        errors,
        duplicate: duplicate
          ? {
              matchType: duplicate.matchType,
              strength: duplicate.strength,
              label: duplicate.label,
              source: duplicate.source,
              rowIndex: duplicate.rowIndex,
            }
          : null,
        contact: {
          firstName: contact.firstName,
          lastName: contact.lastName,
          companyName: contact.company.name,
          email: contact.email,
          phone: contact.phone,
          linkedin: contact.linkedin,
          rank: contact.rank,
          emailStatus: contact.emailStatus,
        },
      };
    });

    const summary = previewRows.reduce(
      (counts, row) => {
        counts[row.status] += 1;
        return counts;
      },
      { ready: 0, duplicate: 0, invalid: 0 },
    );

    return Response.json({ rows: previewRows, summary });
  } catch (error) {
    console.error("Bulk contact preview error:", error);
    return Response.json({ error: "Could not preview the CSV import." }, { status: 500 });
  }
}
