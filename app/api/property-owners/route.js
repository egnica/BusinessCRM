import clientPromise from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PARCEL_SERVICE =
  "https://arcgis.metc.state.mn.us/data1/rest/services/parcels/Parcels/FeatureServer";

const PAGE_SIZE = 2000;
const MAX_SOURCE_RECORDS = 30000;
const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;
const PROJECT_ID = "property-owner-outreach";
const OWNERSHIP_CUTOFF_YEARS = 10;

const OUT_FIELDS = [
  "OBJECTID",
  "COUNTY_PIN",
  "ANUMBERPRE",
  "ANUMBER",
  "ANUMBERSUF",
  "ST_PRE_DIR",
  "ST_NAME",
  "ST_POS_TYP",
  "ST_POS_DIR",
  "ZIP",
  "CTU_NAME",
  "POSTCOMM",
  "CO_NAME",
  "OWNER_NAME",
  "OWNER_MORE",
  "HOMESTEAD",
  "EMV_TOTAL",
  "USECLASS1",
  "DWELL_TYPE",
  "YEAR_BUILT",
  "NUM_UNITS",
  "SALE_DATE",
  "SALE_VALUE",
  "TAX_EXEMPT",
  "OWNERSHIP",
].join(",");

const SOURCES = [
  {
    county: "Hennepin",
    layerId: 3,
    where:
      "CTU_NAME LIKE '%Minneapolis%' AND NUM_UNITS >= 2 AND NUM_UNITS <= 20 AND OWNER_NAME IS NOT NULL",
  },
  {
    county: "Ramsey",
    layerId: 4,
    where:
      "CTU_NAME LIKE '%Paul%' AND NUM_UNITS >= 2 AND NUM_UNITS <= 20 AND OWNER_NAME IS NOT NULL",
  },
];

function clean(value) {
  return value == null ? "" : String(value).trim().replace(/\s+/g, " ");
}

function normalizedKey(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(25, Math.round(parsed)));
}

function toIsoDate(value) {
  if (!value) return null;

  const date =
    typeof value === "number" || /^\d+$/.test(String(value))
      ? new Date(Number(value))
      : new Date(value);

  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function ownershipYearsFromSaleDate(value) {
  const saleDate = toIsoDate(value);
  if (!saleDate) return null;

  const sale = new Date(saleDate + "T00:00:00Z");
  const now = new Date();
  const years = (now.getTime() - sale.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.floor(years));
}

function buildStreetAddress(attributes) {
  return [
    attributes.ANUMBERPRE,
    attributes.ANUMBER,
    attributes.ANUMBERSUF,
    attributes.ST_PRE_DIR,
    attributes.ST_NAME,
    attributes.ST_POS_TYP,
    attributes.ST_POS_DIR,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");
}

function isTaxExempt(value) {
  const normalized = clean(value).toLowerCase();
  return ["y", "yes", "true", "tax exempt", "exempt"].includes(normalized);
}

function classifyOwner(ownerName, ownerMore) {
  const name = clean(ownerName);
  const more = clean(ownerMore);
  const combined = (name + " " + more).toUpperCase();

  const excluded =
    /\b(TRUST|TRUSTEE|ESTATE|CITY OF|COUNTY OF|STATE OF|UNITED STATES|HOUSING AUTHORITY|SCHOOL DISTRICT|CHURCH|UNIVERSITY|HOSPITAL|BANK|MORTGAGE)\b/;

  if (excluded.test(combined)) return "other";

  const entity =
    /\b(LLC|L L C|LIMITED LIABILITY|INC|INCORPORATED|CORP|CORPORATION|LTD|LP|LLP|PARTNERSHIP|PROPERTIES|HOLDINGS)\b/;

  if (entity.test(combined)) return "llc";
  if (more || /\s(&|AND)\s/i.test(name)) return "couple";

  return "individual";
}

function scoreParcel(attributes, ownerType) {
  const ownershipYears = ownershipYearsFromSaleDate(attributes.SALE_DATE);
  const units = Number(attributes.NUM_UNITS) || 0;
  const assessedValue = Number(attributes.EMV_TOTAL) || 0;
  const homestead = clean(attributes.HOMESTEAD).toLowerCase();

  let score = 0;

  if (ownershipYears == null) score += 1;
  else if (ownershipYears >= 20) score += 4;
  else if (ownershipYears >= 15) score += 3;
  else if (ownershipYears >= OWNERSHIP_CUTOFF_YEARS) score += 2;

  if (units >= 2 && units <= 4) score += 4;
  else if (units <= 8) score += 3;
  else if (units <= 12) score += 2;
  else score += 1;

  score += ownerType === "individual" || ownerType === "couple" ? 2 : 1;

  if (homestead && /no|non|false|0/.test(homestead)) score += 1;

  if (assessedValue > 0 && assessedValue <= 1500000) score += 2;
  else if (assessedValue > 0 && assessedValue <= 3000000) score += 1;

  return score;
}

function isEligible(attributes, ownerType) {
  if (!["individual", "couple", "llc"].includes(ownerType)) return false;
  if (!clean(attributes.OWNER_NAME)) return false;
  if (isTaxExempt(attributes.TAX_EXEMPT)) return false;

  const units = Number(attributes.NUM_UNITS);
  if (!Number.isFinite(units) || units < 2 || units > 20) return false;

  const ownershipYears = ownershipYearsFromSaleDate(attributes.SALE_DATE);
  if (ownershipYears != null && ownershipYears < OWNERSHIP_CUTOFF_YEARS) {
    return false;
  }

  return true;
}

function toProperty(attributes, county, ownerType) {
  return {
    parcelId: clean(attributes.COUNTY_PIN),
    county,
    street1: buildStreetAddress(attributes),
    street2: "",
    city: clean(attributes.POSTCOMM || attributes.CTU_NAME),
    state: "MN",
    zip: clean(attributes.ZIP),
    country: "US",
    numUnits: Number(attributes.NUM_UNITS) || null,
    yearBuilt: Number(attributes.YEAR_BUILT) || null,
    assessedValue: Number(attributes.EMV_TOTAL) || null,
    lastSaleDate: toIsoDate(attributes.SALE_DATE),
    lastSaleValue: Number(attributes.SALE_VALUE) || null,
    ownershipYears: ownershipYearsFromSaleDate(attributes.SALE_DATE),
    homestead: clean(attributes.HOMESTEAD),
    dwellingType: clean(attributes.DWELL_TYPE),
    useClass: clean(attributes.USECLASS1),
    ownershipCategory: clean(attributes.OWNERSHIP),
    prospectScore: scoreParcel(attributes, ownerType),
  };
}

async function fetchSource(source) {
  const rows = [];
  let offset = 0;

  while (offset < MAX_SOURCE_RECORDS) {
    const params = new URLSearchParams({
      where: source.where,
      outFields: OUT_FIELDS,
      returnGeometry: "false",
      orderByFields: "OBJECTID",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      f: "json",
    });

    const response = await fetch(
      `${PARCEL_SERVICE}/${source.layerId}/query?${params.toString()}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error(
        `Parcel source request failed for ${source.county}: ${response.status}`,
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(
        `Parcel source error for ${source.county}: ${data.error.message || "Unknown error"}`,
      );
    }

    const features = Array.isArray(data.features) ? data.features : [];

    rows.push(
      ...features.map((feature) => ({
        county: source.county,
        attributes: feature.attributes || {},
      })),
    );

    if (!data.exceededTransferLimit || features.length === 0) break;

    offset += features.length;
  }

  return rows;
}

function groupProspects(rows) {
  const groups = new Map();

  for (const row of rows) {
    const attributes = row.attributes;
    const ownerNameRaw = clean(attributes.OWNER_NAME);
    const ownerMoreRaw = clean(attributes.OWNER_MORE);
    const ownerType = classifyOwner(ownerNameRaw, ownerMoreRaw);

    if (!isEligible(attributes, ownerType)) continue;

    const baseOwnerKey = normalizedKey(ownerNameRaw + "|" + ownerMoreRaw);
    if (!baseOwnerKey) continue;

    const key =
      ownerType === "llc"
        ? `metrogis:entity:${baseOwnerKey}`
        : `metrogis:${row.county.toLowerCase()}:${baseOwnerKey}`;

    const property = toProperty(attributes, row.county, ownerType);

    if (!property.parcelId || !property.street1) continue;

    const existing = groups.get(key) || {
      key,
      ownerNameRaw,
      ownerMoreRaw,
      ownerType,
      properties: [],
    };

    if (!existing.properties.some((item) => item.parcelId === property.parcelId)) {
      existing.properties.push(property);
    }

    groups.set(key, existing);
  }

  return [...groups.values()]
    .map((prospect) => {
      prospect.properties.sort(
        (a, b) => b.prospectScore - a.prospectScore,
      );

      const primaryProperty = prospect.properties[0];
      const portfolioBonus = Math.min(2, Math.max(0, prospect.properties.length - 1));

      return {
        ...prospect,
        primaryProperty,
        propertyCount: prospect.properties.length,
        score: (primaryProperty?.prospectScore || 0) + portfolioBonus,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.propertyCount !== a.propertyCount) {
        return b.propertyCount - a.propertyCount;
      }
      return a.ownerNameRaw.localeCompare(b.ownerNameRaw);
    });
}

async function loadProspects(limit) {
  const sourceResults = await Promise.all(SOURCES.map(fetchSource));
  const rows = sourceResults.flat();
  const prospects = groupProspects(rows);

  return {
    scannedProperties: rows.length,
    matchedOwners: prospects.length,
    prospects: prospects.slice(0, limit),
  };
}

function previewProspect(prospect) {
  const property = prospect.primaryProperty || {};

  return {
    key: prospect.key,
    ownerName: prospect.ownerNameRaw,
    ownerMore: prospect.ownerMoreRaw,
    ownerType: prospect.ownerType,
    score: prospect.score,
    propertyCount: prospect.propertyCount,
    primaryProperty: {
      parcelId: property.parcelId,
      county: property.county,
      street1: property.street1,
      city: property.city,
      state: property.state,
      zip: property.zip,
      numUnits: property.numUnits,
      yearBuilt: property.yearBuilt,
      ownershipYears: property.ownershipYears,
      assessedValue: property.assessedValue,
      lastSaleDate: property.lastSaleDate,
    },
  };
}

function insertDefaults(prospect, now) {
  return {
    firstName: "",
    lastName: "",
    ownerNameRaw: prospect.ownerNameRaw,
    ownerType: prospect.ownerType,
    coOwnerName: prospect.ownerMoreRaw,
    jobTitle: "",
    email: "",
    phone: "",
    company: {
      name: prospect.ownerType === "llc" ? prospect.ownerNameRaw : "",
      website: "",
      industry: "",
    },
    address: {
      street1: "",
      street2: "",
      city: "",
      state: "",
      zip: "",
      country: "US",
    },
    rank: "",
    relationshipType: "Property Owner Prospect",
    facebook: "",
    linkedin: "",
    website: "",
    serviceInterest: [],
    birthday: null,
    notes:
      "Imported from MetroGIS public parcel data for Property Owner Outreach. Personal mailing address, phone, and email were not bulk-imported; verify contact information before outreach.",
    emailStatus: "unknown",
    introEmail: {
      sent: false,
      sentAt: null,
    },
    lastContact: {
      date: null,
      type: "",
      notes: "",
    },
    nextFollowUp: null,
    createdAt: now,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const limit = clampLimit(url.searchParams.get("limit"));
    const data = await loadProspects(limit);

    return Response.json({
      summary: {
        scannedProperties: data.scannedProperties,
        matchedOwners: data.matchedOwners,
        previewCount: data.prospects.length,
        geography: ["Minneapolis", "Saint Paul"],
        criteria: {
          residentialUnits: "2-20",
          minimumOwnershipYears: OWNERSHIP_CUTOFF_YEARS,
          ownerTypes: ["individual", "couple", "llc/entity"],
          excludes: [
            "recent sales under 10 years",
            "tax-exempt parcels",
            "obvious government, trust, estate, bank, and institutional records",
          ],
        },
      },
      prospects: data.prospects.slice(0, 30).map(previewProspect),
    });
  } catch (error) {
    console.error("Property owner preview error:", error);

    return Response.json(
      {
        error: "Failed to build property owner preview",
        details: error.message,
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = clampLimit(body.limit);
    const data = await loadProspects(limit);
    const prospects = data.prospects;
    const now = new Date().toISOString();

    if (!prospects.length) {
      return Response.json({
        message: "No matching property owner prospects found.",
        importedCount: 0,
        updatedCount: 0,
      });
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const contactsCollection = db.collection("contacts");

    const operations = prospects.map((prospect) => ({
      updateOne: {
        filter: { propertyOutreachKey: prospect.key },
        update: {
          $set: {
            project: PROJECT_ID,
            ownerNameRaw: prospect.ownerNameRaw,
            ownerType: prospect.ownerType,
            coOwnerName: prospect.ownerMoreRaw,
            relationshipType: "Property Owner Prospect",
            property: prospect.primaryProperty,
            properties: prospect.properties,
            propertyOutreachKey: prospect.key,
            propertyOutreach: {
              source: "MetroGIS Regional Parcel Dataset",
              sourceUrl:
                "https://arcgis.metc.state.mn.us/data1/rest/services/parcels/Parcels/FeatureServer",
              score: prospect.score,
              propertyCount: prospect.propertyCount,
              lastRefreshedAt: now,
              criteriaVersion: "2026-08-28-v1",
            },
            updatedAt: now,
          },
          $setOnInsert: insertDefaults(prospect, now),
        },
        upsert: true,
      },
    }));

    const result = await contactsCollection.bulkWrite(operations, {
      ordered: false,
    });

    return Response.json({
      message: "Property owner outreach import complete.",
      requestedCount: prospects.length,
      importedCount: result.upsertedCount || 0,
      updatedCount: result.modifiedCount || 0,
      matchedCount: result.matchedCount || 0,
      scannedProperties: data.scannedProperties,
      matchedOwners: data.matchedOwners,
    });
  } catch (error) {
    console.error("Property owner import error:", error);

    return Response.json(
      {
        error: "Failed to import property owner prospects",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
