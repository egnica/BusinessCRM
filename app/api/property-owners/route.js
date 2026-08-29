import clientPromise from "@/lib/mongodb";
import { searchPropertyOwners } from "@/lib/propertyOwnerSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readFilters(searchParams) {
  return {
    minProperties: searchParams.get("minProperties"),
    maxProperties: searchParams.get("maxProperties"),
    maxResults: searchParams.get("maxResults"),
    city: searchParams.get("city") || "",
  };
}

async function addSavedState(prospects) {
  if (!prospects.length) return prospects;

  const client = await clientPromise;
  const db = client.db("crm");
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

  const lookup = {
    $or: [
      { propertyOutreachKey: { $in: keys } },
      { propertyOutreachAliases: { $in: keys } },
      { "properties.parcelKey": { $in: parcelKeys } },
      { "properties.parcelId": { $in: parcelIds } },
    ],
  };

  const [savedProspects, crmContacts] = await Promise.all([
    db
      .collection("propertyProspects")
      .find(lookup, {
        projection: {
          propertyOutreachKey: 1,
          propertyOutreachAliases: 1,
          properties: 1,
          crmContactId: 1,
          mailingAddress: 1,
          taxNameRaw: 1,
        },
      })
      .toArray(),
    db
      .collection("contacts")
      .find(lookup, {
        projection: {
          propertyOutreachKey: 1,
          propertyOutreachAliases: 1,
          properties: 1,
          _id: 1,
        },
      })
      .toArray(),
  ]);

  function buildMaps(records) {
    const byKey = new Map();
    const byParcel = new Map();

    for (const record of records) {
      if (record.propertyOutreachKey) {
        byKey.set(record.propertyOutreachKey, record);
      }

      for (const alias of record.propertyOutreachAliases || []) {
        byKey.set(alias, record);
      }

      for (const property of record.properties || []) {
        const parcelKey =
          property.parcelKey ||
          (property.county && property.parcelId
            ? `${property.county}:${property.parcelId}`
            : "");

        if (parcelKey) {
          byParcel.set(parcelKey, record);
        }
      }
    }

    return { byKey, byParcel };
  }

  const savedMaps = buildMaps(savedProspects);
  const crmMaps = buildMaps(crmContacts);

  return prospects.map((prospect) => {
    const saved =
      savedMaps.byKey.get(prospect.propertyOutreachKey) ||
      (prospect.properties || [])
        .map((property) =>
          savedMaps.byParcel.get(
            property.parcelKey ||
              (property.county && property.parcelId
                ? `${property.county}:${property.parcelId}`
                : ""),
          ),
        )
        .find(Boolean);

    const crm =
      crmMaps.byKey.get(prospect.propertyOutreachKey) ||
      (prospect.properties || [])
        .map((property) =>
          crmMaps.byParcel.get(
            property.parcelKey ||
              (property.county && property.parcelId
                ? `${property.county}:${property.parcelId}`
                : ""),
          ),
        )
        .find(Boolean);

    return {
      ...prospect,
      saved: Boolean(saved),
      savedProspectId: saved?._id?.toString() || "",
      inCrm: Boolean(crm || saved?.crmContactId),
      crmContactId:
        crm?._id?.toString() || saved?.crmContactId?.toString?.() || "",
      savedMailingName:
        saved?.taxNameRaw ||
        saved?.mailingAddress?.recipientName ||
        "",
    };
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const filters = readFilters(url.searchParams);
    const page = Number(url.searchParams.get("page")) || 1;
    const pageSize = Number(url.searchParams.get("pageSize")) || 25;

    const result = await searchPropertyOwners(filters, {
      page,
      pageSize,
    });

    const markedProspects = await addSavedState(result.prospects);

    return Response.json({
      ...result,
      prospects: markedProspects.map((prospect) => {
        const mailingName =
          prospect.savedMailingName ||
          prospect.taxNameRaw ||
          prospect.mailingAddress?.recipientName ||
          "";
        const {
          mailingAddress: _mailingAddress,
          savedMailingName: _savedMailingName,
          ...searchProspect
        } = prospect;

        return {
          ...searchProspect,
          mailingName,
        };
      }),
    });
  } catch (error) {
    console.error("Property owner search error:", error);

    return Response.json(
      {
        error: "Failed to search property owners",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
