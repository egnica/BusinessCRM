import clientPromise from "@/lib/mongodb";
import {
  COUNTY_OPTIONS,
  getCitiesForCounty,
  searchPropertyOwners,
} from "@/lib/propertyOwnerSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readFilters(searchParams) {
  return {
    county: searchParams.get("county") || "Hennepin",
    cities: parseList(searchParams.get("cities")),
    minUnits: searchParams.get("minUnits"),
    maxUnits: searchParams.get("maxUnits"),
    minOwnershipYears: searchParams.get("minOwnershipYears"),
    ownerTypes: parseList(searchParams.get("ownerTypes")),
    homestead: searchParams.get("homestead") || "any",
    minAssessedValue: searchParams.get("minAssessedValue"),
    maxAssessedValue: searchParams.get("maxAssessedValue"),
    builtBefore: searchParams.get("builtBefore"),
    minPortfolioSize: searchParams.get("minPortfolioSize"),
  };
}

async function addSavedState(prospects) {
  if (!prospects.length) return prospects;

  const client = await clientPromise;
  const db = client.db("crm");
  const keys = prospects.map((prospect) => prospect.propertyOutreachKey);

  const [savedProspects, crmContacts] = await Promise.all([
    db
      .collection("propertyProspects")
      .find(
        { propertyOutreachKey: { $in: keys } },
        { projection: { propertyOutreachKey: 1, crmContactId: 1 } },
      )
      .toArray(),
    db
      .collection("contacts")
      .find(
        { propertyOutreachKey: { $in: keys } },
        { projection: { propertyOutreachKey: 1, _id: 1 } },
      )
      .toArray(),
  ]);

  const savedByKey = new Map(
    savedProspects.map((prospect) => [
      prospect.propertyOutreachKey,
      prospect,
    ]),
  );
  const crmByKey = new Map(
    crmContacts.map((contact) => [contact.propertyOutreachKey, contact]),
  );

  return prospects.map((prospect) => {
    const saved = savedByKey.get(prospect.propertyOutreachKey);
    const crm = crmByKey.get(prospect.propertyOutreachKey);

    return {
      ...prospect,
      saved: Boolean(saved),
      savedProspectId: saved?._id?.toString() || "",
      inCrm: Boolean(crm || saved?.crmContactId),
      crmContactId:
        crm?._id?.toString() || saved?.crmContactId?.toString?.() || "",
    };
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");

    if (mode === "metadata") {
      const county = url.searchParams.get("county") || "Hennepin";
      const cities = COUNTY_OPTIONS.includes(county)
        ? await getCitiesForCounty(county)
        : [];

      return Response.json({
        counties: COUNTY_OPTIONS,
        county,
        cities,
      });
    }

    const filters = readFilters(url.searchParams);
    const page = Number(url.searchParams.get("page")) || 1;
    const pageSize = Number(url.searchParams.get("pageSize")) || 25;

    const result = await searchPropertyOwners(filters, {
      page,
      pageSize,
    });

    return Response.json({
      ...result,
      prospects: await addSavedState(result.prospects),
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
