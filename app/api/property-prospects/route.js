import clientPromise from "@/lib/mongodb";
import { searchPropertyOwners } from "@/lib/propertyOwnerSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SAVE_FILTERED = 250;

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
}

function serializeProspect(prospect) {
  return {
    ...prospect,
    _id: prospect._id?.toString?.() || prospect._id,
    crmContactId:
      prospect.crmContactId?.toString?.() || prospect.crmContactId || "",
  };
}

function mergeProperties(existing = [], incoming = []) {
  const byParcel = new Map();

  for (const property of [...existing, ...incoming]) {
    if (!property?.parcelId) continue;
    byParcel.set(property.parcelId, property);
  }

  return [...byParcel.values()].sort((a, b) => {
    const scoreA = Number(a.prospectScore) || 0;
    const scoreB = Number(b.prospectScore) || 0;
    return scoreB - scoreA;
  });
}

async function saveProspects(prospects, filters) {
  if (!prospects.length) {
    return {
      savedCount: 0,
      newCount: 0,
      updatedCount: 0,
    };
  }

  const client = await clientPromise;
  const db = client.db("crm");
  const collection = db.collection("propertyProspects");
  const keys = prospects.map((prospect) => prospect.propertyOutreachKey);
  const parcelKeys = prospects.flatMap((prospect) =>
    (prospect.properties || [])
      .map((property) => property.parcelKey)
      .filter(Boolean),
  );
  const parcelIds = prospects.flatMap((prospect) =>
    (prospect.properties || [])
      .map((property) => property.parcelId)
      .filter(Boolean),
  );

  const existingProspects = await collection
    .find({
      $or: [
        { propertyOutreachKey: { $in: keys } },
        { propertyOutreachAliases: { $in: keys } },
        { "properties.parcelKey": { $in: parcelKeys } },
        { "properties.parcelId": { $in: parcelIds } },
      ],
    })
    .toArray();

  const existingByKey = new Map();
  const existingByParcel = new Map();

  for (const prospect of existingProspects) {
    if (prospect.propertyOutreachKey) {
      existingByKey.set(prospect.propertyOutreachKey, prospect);
    }

    for (const alias of prospect.propertyOutreachAliases || []) {
      existingByKey.set(alias, prospect);
    }

    for (const property of prospect.properties || []) {
      const parcelKey =
        property.parcelKey ||
        (property.county && property.parcelId
          ? `${property.county}:${property.parcelId}`
          : "");

      if (parcelKey) {
        existingByParcel.set(parcelKey, prospect);
      }
    }
  }

  const now = new Date().toISOString();
  const operations = prospects.map((prospect) => {
    const existing =
      existingByKey.get(prospect.propertyOutreachKey) ||
      (prospect.properties || [])
        .map((property) =>
          existingByParcel.get(
            property.parcelKey ||
              (property.county && property.parcelId
                ? `${property.county}:${property.parcelId}`
                : ""),
          ),
        )
        .find(Boolean);

    const properties = mergeProperties(
      existing?.properties || [],
      prospect.properties || [],
    );

    const currentPrimaryParcelId =
      existing?.primaryParcelId &&
      properties.some(
        (property) => property.parcelId === existing.primaryParcelId,
      )
        ? existing.primaryParcelId
        : prospect.primaryParcelId || properties[0]?.parcelId || "";

    const primaryProperty =
      properties.find(
        (property) => property.parcelId === currentPrimaryParcelId,
      ) ||
      prospect.primaryProperty ||
      properties[0] ||
      null;

    const mailingAddress =
      existing?.mailingAddress?.lines?.length
        ? existing.mailingAddress
        : prospect.mailingAddress;

    const aliases = [
      ...new Set([
        ...(existing?.propertyOutreachAliases || []),
        existing?.propertyOutreachKey,
        prospect.propertyOutreachKey,
      ].filter(Boolean)),
    ];

    const canonicalKey =
      existing?.propertyOutreachKey || prospect.propertyOutreachKey;

    return {
      updateOne: {
        filter: existing
          ? { _id: existing._id }
          : { propertyOutreachKey: canonicalKey },
        update: {
          $set: {
            propertyOutreachKey: canonicalKey,
            propertyOutreachAliases: aliases,
            ownerNameRaw: prospect.ownerNameRaw,
            ownerMoreRaw: prospect.ownerMoreRaw,
            ownerType: prospect.ownerType,
            coOwnerName: prospect.coOwnerName || "",
            mailingAddress,
            properties,
            propertyCount: properties.length,
            primaryParcelId: currentPrimaryParcelId,
            primaryProperty,
            score: prospect.score,
            source: {
              provider: "MetroGIS Regional Parcel Dataset",
              lastRefreshedAt: now,
              lastMatchedFilters: filters,
            },
            updatedAt: now,
          },
          $setOnInsert: {
            status: "new",
            mailStatus: "unmailed",
            mailHistory: [],
            notes: "",
            crmContactId: null,
            promotedAt: null,
            archivedAt: null,
            createdAt: now,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await collection.bulkWrite(operations, { ordered: false });

  return {
    savedCount: prospects.length,
    newCount: result.upsertedCount || 0,
    updatedCount: result.modifiedCount || 0,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "active";
    const mailStatus = url.searchParams.get("mailStatus") || "all";
    const query = (url.searchParams.get("query") || "").trim();

    const filter = {};

    if (status === "active") {
      filter.status = { $ne: "archived" };
    } else if (status !== "all") {
      filter.status = status;
    }

    if (mailStatus !== "all") {
      filter.mailStatus = mailStatus;
    }

    if (query) {
      const safeQuery = escapeRegex(query);
      filter.$or = [
        { ownerNameRaw: { $regex: safeQuery, $options: "i" } },
        { ownerMoreRaw: { $regex: safeQuery, $options: "i" } },
        { "primaryProperty.street1": { $regex: safeQuery, $options: "i" } },
        { "primaryProperty.city": { $regex: safeQuery, $options: "i" } },
        { "properties.street1": { $regex: safeQuery, $options: "i" } },
      ];
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const prospects = await db
      .collection("propertyProspects")
      .find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1000)
      .toArray();

    return Response.json({
      prospects: prospects.map(serializeProspect),
      count: prospects.length,
    });
  } catch (error) {
    console.error("Property prospects fetch error:", error);

    return Response.json(
      {
        error: "Failed to load saved property prospects",
        details: error.message,
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body.action;
    const filters = body.filters || {};

    if (!["saveSelected", "saveFiltered"].includes(action)) {
      return Response.json(
        { error: "Unsupported property prospect action" },
        { status: 400 },
      );
    }

    const result = await searchPropertyOwners(filters, {
      paginate: false,
      maxOwners: 50000,
      includeMailingAddress: true,
    });

    let prospects = result.prospects;

    if (action === "saveSelected") {
      const keys = Array.isArray(body.keys)
        ? body.keys.filter(Boolean)
        : [];

      if (!keys.length) {
        return Response.json(
          { error: "Select at least one owner to save" },
          { status: 400 },
        );
      }

      const selectedKeys = new Set(keys);
      prospects = prospects.filter((prospect) =>
        selectedKeys.has(prospect.propertyOutreachKey),
      );
    }

    if (action === "saveFiltered" && result.total > MAX_SAVE_FILTERED) {
      return Response.json(
        {
          error:
            "This filter returns too many owners to save at once. Narrow the filters first.",
          total: result.total,
          maxSaveFiltered: MAX_SAVE_FILTERED,
        },
        { status: 400 },
      );
    }

    const saved = await saveProspects(prospects, result.filters);

    return Response.json({
      ...saved,
      matchedCount: result.total,
      maxSaveFiltered: MAX_SAVE_FILTERED,
    });
  } catch (error) {
    console.error("Property prospects save error:", error);

    return Response.json(
      {
        error: "Failed to save property prospects",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
