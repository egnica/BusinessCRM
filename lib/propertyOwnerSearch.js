const PARCEL_SERVICE =
  "https://arcgis.metc.state.mn.us/data1/rest/services/parcels/Parcels/FeatureServer";

export const COUNTY_LAYERS = {
  Anoka: 0,
  Carver: 1,
  Dakota: 2,
  Hennepin: 3,
  Ramsey: 4,
  Scott: 5,
  Washington: 6,
};

export const COUNTY_OPTIONS = Object.keys(COUNTY_LAYERS);

const PAGE_SIZE = 2000;
const MAX_SOURCE_RECORDS_PER_COUNTY = 30000;
const DEFAULT_RESULT_PAGE_SIZE = 25;
const MAX_RESULT_PAGE_SIZE = 100;

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
  "OWN_ADD_L1",
  "OWN_ADD_L2",
  "OWN_ADD_L3",
  "OWN_ADD_L4",
  "TAX_NAME",
  "TAX_ADD_L1",
  "TAX_ADD_L2",
  "TAX_ADD_L3",
  "TAX_ADD_L4",
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

function clean(value) {
  return value == null ? "" : String(value).trim().replace(/\s+/g, " ");
}

function normalizeText(value) {
  return clean(value).toLowerCase();
}

function normalizedKey(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
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
  const years =
    (now.getTime() - sale.getTime()) /
    (365.2425 * 24 * 60 * 60 * 1000);

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
  const normalized = normalizeText(value);

  return ["y", "yes", "true", "tax exempt", "exempt", "1"].includes(
    normalized,
  );
}

function homesteadState(value) {
  const normalized = normalizeText(value);

  if (!normalized) return "unknown";

  if (["y", "yes", "true", "1", "homestead"].includes(normalized)) {
    return "homestead";
  }

  if (
    ["n", "no", "false", "0", "non-homestead", "nonhomestead"].includes(
      normalized,
    )
  ) {
    return "non-homestead";
  }

  if (normalized.includes("non")) return "non-homestead";
  if (normalized.includes("yes")) return "homestead";
  if (normalized.includes("no")) return "non-homestead";

  return "unknown";
}

function classifyOwner(ownerName, ownerMore) {
  const name = clean(ownerName);
  const more = clean(ownerMore);
  const combined = (name + " " + more).toUpperCase();

  const excluded =
    /\b(TRUST|TRUSTEE|ESTATE|CITY OF|COUNTY OF|STATE OF|UNITED STATES|HOUSING AUTHORITY|SCHOOL DISTRICT|CHURCH|UNIVERSITY|HOSPITAL|BANK|MORTGAGE)\b/;

  if (excluded.test(combined)) return "other";

  const entity =
    /\b(LLC|L L C|LIMITED LIABILITY|INC|INCORPORATED|CORP|CORPORATION|LTD|LP|LLP|PARTNERSHIP|PROPERTIES|HOLDINGS|INVESTMENTS|REALTY|MANAGEMENT|APARTMENTS|ASSOCIATES|VENTURES|GROUP)\b/;

  if (entity.test(combined)) return "llc";

  const moreLooksLikeOwner =
    more && !/^(C\/?O|ATTN|ATTENTION|CARE OF|%)/i.test(more);

  if (moreLooksLikeOwner || /\s(&|AND)\s/i.test(name)) return "couple";

  return "individual";
}

function scoreParcel(attributes, ownerType) {
  const ownershipYears = ownershipYearsFromSaleDate(attributes.SALE_DATE);
  const units = Number(attributes.NUM_UNITS) || 0;
  const assessedValue = Number(attributes.EMV_TOTAL) || 0;
  const homestead = homesteadState(attributes.HOMESTEAD);

  let score = 0;

  if (ownershipYears == null) score += 1;
  else if (ownershipYears >= 30) score += 5;
  else if (ownershipYears >= 20) score += 4;
  else if (ownershipYears >= 15) score += 3;
  else if (ownershipYears >= 10) score += 2;

  if (units >= 2 && units <= 4) score += 4;
  else if (units <= 8) score += 3;
  else if (units <= 12) score += 2;
  else score += 1;

  score += ownerType === "individual" || ownerType === "couple" ? 2 : 1;

  if (homestead === "non-homestead") score += 1;

  if (assessedValue > 0 && assessedValue <= 1500000) score += 2;
  else if (assessedValue > 0 && assessedValue <= 3000000) score += 1;

  return score;
}

function buildMailingAddress(attributes) {
  const ownerLines = [
    attributes.OWN_ADD_L1,
    attributes.OWN_ADD_L2,
    attributes.OWN_ADD_L3,
    attributes.OWN_ADD_L4,
  ]
    .map(clean)
    .filter(Boolean);

  const taxLines = [
    attributes.TAX_ADD_L1,
    attributes.TAX_ADD_L2,
    attributes.TAX_ADD_L3,
    attributes.TAX_ADD_L4,
  ]
    .map(clean)
    .filter(Boolean);

  if (ownerLines.length) {
    return {
      source: "owner",
      recipientName: clean(attributes.OWNER_NAME),
      lines: ownerLines,
    };
  }

  if (taxLines.length) {
    return {
      source: "taxpayer",
      recipientName:
        clean(attributes.TAX_NAME) || clean(attributes.OWNER_NAME),
      lines: taxLines,
    };
  }

  return {
    source: "",
    recipientName: clean(attributes.OWNER_NAME),
    lines: [],
  };
}

function toProperty(attributes, county, ownerType) {
  return {
    parcelId: clean(attributes.COUNTY_PIN),
    county,
    municipality: clean(attributes.CTU_NAME),
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
    homesteadState: homesteadState(attributes.HOMESTEAD),
    dwellingType: clean(attributes.DWELL_TYPE),
    useClass: clean(attributes.USECLASS1),
    ownershipCategory: clean(attributes.OWNERSHIP),
    prospectScore: scoreParcel(attributes, ownerType),
  };
}

function normalizeFilters(filters = {}) {
  const geography =
    filters.geography === "all" || COUNTY_LAYERS[filters.geography] != null
      ? filters.geography
      : "all";

  return {
    geography,
    minUnits: clampNumber(filters.minUnits, 2, 1, 999),
    maxUnits: clampNumber(filters.maxUnits, 4, 1, 999),
    minPortfolioSize: Math.round(
      clampNumber(filters.minPortfolioSize, 1, 1, 1000),
    ),
  };
}

function buildWhere(filters) {
  return [
    "OWNER_NAME IS NOT NULL",
    `NUM_UNITS >= ${Math.min(filters.minUnits, filters.maxUnits)}`,
    `NUM_UNITS <= ${Math.max(filters.minUnits, filters.maxUnits)}`,
  ].join(" AND ");
}

async function arcgisQuery(layerId, params) {
  const searchParams = new URLSearchParams({
    returnGeometry: "false",
    f: "json",
    ...params,
  });

  const response = await fetch(
    `${PARCEL_SERVICE}/${layerId}/query?${searchParams.toString()}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`MetroGIS request failed with HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(
      data.error.message ||
        data.error.details?.join(" ") ||
        "MetroGIS parcel query failed",
    );
  }

  return data;
}

async function fetchCountyRows(county, filters) {
  const layerId = COUNTY_LAYERS[county];
  const rows = [];
  let offset = 0;

  while (offset < MAX_SOURCE_RECORDS_PER_COUNTY) {
    const data = await arcgisQuery(layerId, {
      where: buildWhere(filters),
      outFields: OUT_FIELDS,
      orderByFields: "OBJECTID",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
    });

    const features = Array.isArray(data.features) ? data.features : [];

    rows.push(
      ...features.map((feature) => ({
        county,
        attributes: feature.attributes || {},
      })),
    );

    if (!data.exceededTransferLimit || features.length === 0) break;

    offset += features.length;
  }

  if (rows.length >= MAX_SOURCE_RECORDS_PER_COUNTY) {
    throw new Error(
      `${county} returned more than ${MAX_SOURCE_RECORDS_PER_COUNTY.toLocaleString("en-US")} matching parcels. Try a smaller property-size range.`,
    );
  }

  return rows;
}

async function fetchSourceRows(filters) {
  const counties =
    filters.geography === "all" ? COUNTY_OPTIONS : [filters.geography];

  const countyResults = await Promise.all(
    counties.map((county) => fetchCountyRows(county, filters)),
  );

  const rows = countyResults.flat();

  return {
    rows,
    sourceCount: rows.length,
    counties,
  };
}

function passesPropertyFilters(attributes, ownerType) {
  if (!["individual", "couple", "llc"].includes(ownerType)) return false;
  if (isTaxExempt(attributes.TAX_EXEMPT)) return false;
  return true;
}

function ownerIdentityKey(attributes, county, ownerType) {
  const ownerNameRaw = clean(attributes.OWNER_NAME);
  const ownerMoreRaw = clean(attributes.OWNER_MORE);
  const ownerKey = normalizedKey(ownerNameRaw);
  const moreKey =
    ownerType === "couple" ? normalizedKey(ownerMoreRaw) : "";

  if (!ownerKey) return "";

  if (ownerType === "llc") {
    return `metrogis:entity:${ownerKey}`;
  }

  const mailingAddress = buildMailingAddress(attributes);
  const mailingKey = normalizedKey(
    (mailingAddress.lines || []).join("|"),
  );

  if (mailingKey) {
    return `metrogis:owner:${ownerKey}:${moreKey}:${mailingKey}`;
  }

  return `metrogis:${county.toLowerCase()}:${ownerKey}:${moreKey}`;
}

function groupRows(rows, filters) {
  const groups = new Map();

  for (const row of rows) {
    const attributes = row.attributes;
    const ownerNameRaw = clean(attributes.OWNER_NAME);
    const ownerMoreRaw = clean(attributes.OWNER_MORE);
    const ownerType = classifyOwner(ownerNameRaw, ownerMoreRaw);

    if (!ownerNameRaw) continue;
    if (!passesPropertyFilters(attributes, ownerType)) continue;

    const key = ownerIdentityKey(attributes, row.county, ownerType);
    if (!key) continue;

    const property = toProperty(attributes, row.county, ownerType);

    if (!property.parcelId || !property.street1) continue;

    const existing = groups.get(key) || {
      propertyOutreachKey: key,
      ownerNameRaw,
      ownerMoreRaw,
      ownerType,
      coOwnerName: ownerType === "couple" ? ownerMoreRaw : "",
      mailingAddress: buildMailingAddress(attributes),
      properties: [],
    };

    if (!existing.mailingAddress?.lines?.length) {
      existing.mailingAddress = buildMailingAddress(attributes);
    }

    if (
      !existing.properties.some(
        (item) =>
          item.parcelId === property.parcelId &&
          item.county === property.county,
      )
    ) {
      existing.properties.push(property);
    }

    groups.set(key, existing);
  }

  return [...groups.values()]
    .map((prospect) => {
      prospect.properties.sort((a, b) => {
        const yearsA = a.ownershipYears ?? -1;
        const yearsB = b.ownershipYears ?? -1;

        if (yearsB !== yearsA) return yearsB - yearsA;
        return (b.prospectScore || 0) - (a.prospectScore || 0);
      });

      const primaryProperty = prospect.properties[0] || null;
      const propertyCount = prospect.properties.length;
      const totalUnits = prospect.properties.reduce(
        (sum, property) => sum + (Number(property.numUnits) || 0),
        0,
      );
      const totalAssessedValue = prospect.properties.reduce(
        (sum, property) => sum + (Number(property.assessedValue) || 0),
        0,
      );
      const longestHeldYears = prospect.properties.reduce(
        (longest, property) =>
          property.ownershipYears == null
            ? longest
            : Math.max(longest, property.ownershipYears),
        -1,
      );
      const locations = [
        ...new Set(
          prospect.properties
            .map(
              (property) =>
                property.municipality || property.city || property.county,
            )
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b));
      const counties = [
        ...new Set(
          prospect.properties.map((property) => property.county).filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b));
      const portfolioBonus = Math.min(8, Math.max(0, propertyCount - 1));

      return {
        ...prospect,
        primaryProperty,
        primaryParcelId: primaryProperty?.parcelId || "",
        propertyCount,
        totalUnits,
        totalAssessedValue,
        longestHeldYears:
          longestHeldYears >= 0 ? longestHeldYears : null,
        locations,
        counties,
        score: (primaryProperty?.prospectScore || 0) + portfolioBonus,
      };
    })
    .filter(
      (prospect) => prospect.propertyCount >= filters.minPortfolioSize,
    )
    .sort((a, b) => {
      if (b.propertyCount !== a.propertyCount) {
        return b.propertyCount - a.propertyCount;
      }

      const yearsA = a.longestHeldYears ?? -1;
      const yearsB = b.longestHeldYears ?? -1;

      if (yearsB !== yearsA) return yearsB - yearsA;
      if (b.totalUnits !== a.totalUnits) return b.totalUnits - a.totalUnits;
      if (b.score !== a.score) return b.score - a.score;

      return a.ownerNameRaw.localeCompare(b.ownerNameRaw);
    });
}

export async function searchPropertyOwners(
  rawFilters = {},
  options = {},
) {
  const filters = normalizeFilters(rawFilters);
  const source = await fetchSourceRows(filters);
  const prospects = groupRows(source.rows, filters);

  const paginate = options.paginate !== false;
  const pageSize = Math.round(
    clampNumber(
      options.pageSize,
      DEFAULT_RESULT_PAGE_SIZE,
      1,
      MAX_RESULT_PAGE_SIZE,
    ),
  );
  const total = prospects.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.round(
    clampNumber(options.page, 1, 1, totalPages),
  );

  if (!paginate) {
    const maxOwners = Math.round(
      clampNumber(options.maxOwners, total || 1, 1, 50000),
    );

    return {
      filters,
      sourcePropertyCount: source.sourceCount,
      searchedCounties: source.counties,
      total,
      prospects: prospects.slice(0, maxOwners),
    };
  }

  const start = (requestedPage - 1) * pageSize;

  return {
    filters,
    sourcePropertyCount: source.sourceCount,
    searchedCounties: source.counties,
    total,
    page: requestedPage,
    pageSize,
    totalPages,
    prospects: prospects.slice(start, start + pageSize),
  };
}
