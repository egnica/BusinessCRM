import getMongoClient from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { randomBytes, randomUUID } from "node:crypto";
import {
  addContactToDuplicateIndex,
  normalizeContactTags,
  applyAdditionalImportFields,
  buildImportUpdateSet,
  createDuplicateIndex,
  findDuplicateContact,
  normalizeImportRow,
} from "@/lib/contactImport.mjs";



const TRACKING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TRACKING_LENGTH = 8;

function createTrackingId() {
  const bytes = randomBytes(TRACKING_LENGTH);
  let value = "NE-";

  for (let index = 0; index < TRACKING_LENGTH; index += 1) {
    value += TRACKING_ALPHABET[bytes[index] % TRACKING_ALPHABET.length];
  }

  return value;
}

async function ensureTrackingIdIndex(collection) {
  await collection.createIndex(
    { trackingId: 1 },
    {
      unique: true,
      name: "trackingId_unique",
      partialFilterExpression: { trackingId: { $type: "string" } },
    },
  );
}

async function insertWithTrackingId(collection, contact) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const trackingId = createTrackingId();

    try {
      const result = await collection.insertOne({ ...contact, trackingId });
      return {
        result,
        contact: { ...contact, trackingId },
      };
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  throw new Error("Could not generate a unique tracking ID.");
}

const MAX_ROWS = 2500;
const MODES = new Set(["skip", "update", "import"]);

export async function POST(req) {
  let imports;
  let batchId = "";

  try {
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const additionalFields = body.additionalFields;
    const duplicateMode = MODES.has(body.duplicateMode) ? body.duplicateMode : "skip";
    const fileName = String(body.fileName || "contacts.csv").slice(0, 180);
    batchId = /^[a-f0-9-]{36}$/i.test(body.batchId || "") ? body.batchId : randomUUID();

    if (!rows.length) {
      return Response.json({ error: "No contact rows were provided." }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return Response.json({ error: "CSV imports are limited to " + MAX_ROWS + " rows at a time." }, { status: 400 });
    }

    const client = await getMongoClient();
    const db = client.db("crm");
    const contacts = db.collection("contacts");
    await ensureTrackingIdIndex(contacts);
    imports = db.collection("contactImports");

    const existingBatch = await imports.findOne({ _id: batchId });
    if (existingBatch?.status === "completed" && existingBatch.result) {
      return Response.json({ ...existingBatch.result, replayed: true });
    }
    if (existingBatch?.status === "processing") {
      return Response.json(
        { error: "This import is already processing. Wait a moment before trying again." },
        { status: 409 },
      );
    }

    if (!existingBatch) {
      await imports.insertOne({
        _id: batchId,
        batchId,
        fileName,
        duplicateMode,
        totalRows: rows.length,
        status: "processing",
        createdAt: new Date().toISOString(),
      });
    } else {
      await imports.updateOne(
        { _id: batchId },
        {
          $set: {
            status: "processing",
            fileName,
            duplicateMode,
            totalRows: rows.length,
            restartedAt: new Date().toISOString(),
          },
        },
      );
    }

    const existingContacts = await contacts.find({}).toArray();
    const duplicateIndex = createDuplicateIndex(existingContacts);
    const now = new Date().toISOString();

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let index = 0; index < rows.length; index += 1) {
      const raw = rows[index];
      const normalized = normalizeImportRow(applyAdditionalImportFields(raw, additionalFields), { now, batchId, fileName });

      if (normalized.errors.length) {
        errorCount += 1;
        if (errors.length < 20) {
          errors.push({ rowNumber: index + 2, messages: normalized.errors });
        }
        continue;
      }

      const duplicate = findDuplicateContact(normalized.contact, duplicateIndex);

      if (duplicate && duplicateMode === "skip") {
        skippedCount += 1;
        continue;
      }

      if (duplicate && duplicateMode === "update") {
        if (!duplicate.id || !ObjectId.isValid(duplicate.id)) {
          skippedCount += 1;
          continue;
        }

        const update = buildImportUpdateSet(raw, normalized.contact, {
          now,
          batchId,
          fileName,
        });
        const incomingTags = normalizeContactTags(raw.tags);
        await contacts.updateOne(
          { _id: new ObjectId(duplicate.id) },
          { $set: update, ...(incomingTags.length ? { $addToSet: { tags: { $each: incomingTags } } } : {}) },
        );
        updatedCount += 1;
        addContactToDuplicateIndex(
          duplicateIndex,
          { ...normalized.contact, _id: new ObjectId(duplicate.id) },
          { source: "database" },
        );
        continue;
      }

      const inserted = await insertWithTrackingId(
        contacts,
        normalized.contact,
      );
      importedCount += 1;
      addContactToDuplicateIndex(
        duplicateIndex,
        {
          ...inserted.contact,
          _id: inserted.result.insertedId,
        },
        { source: "batch" },
      );
    }

    const result = {
      batchId,
      fileName,
      totalRows: rows.length,
      importedCount,
      updatedCount,
      skippedCount,
      errorCount,
      errors,
      duplicateMode,
      completedAt: new Date().toISOString(),
    };

    await imports.updateOne(
      { _id: batchId },
      {
        $set: {
          status: "completed",
          completedAt: result.completedAt,
          result,
        },
      },
    );

    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("Bulk contact import error:", error);
    if (imports && batchId) {
      try {
        await imports.updateOne(
          { _id: batchId },
          {
            $set: {
              status: "failed",
              failedAt: new Date().toISOString(),
              error: "Import failed before completion.",
            },
          },
        );
      } catch {}
    }
    return Response.json(
      { error: "Could not complete the CSV import. No retry was started automatically." },
      { status: 500 },
    );
  }
}
