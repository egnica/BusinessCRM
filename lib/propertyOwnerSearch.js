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
const MAX_SOURCE_RECORDS = 15000;
const DEFAULT_RESULT_PAGE_SIZE = 25;
const MAX_RESULT_PAGE_SIZE = 100;

const BASE_OUT_FIELDS = [
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
];

const MAILING_OUT_FIELDS = [
  "OWN_ADD_L1",
  "OWN_ADD_L2",
  "OWN_ADD_L3",
  "OWN_ADD_L4",
  "TAX_NAME",
  "TAX_ADD_L1",
  "TAX_ADD_L2",
  "TAX_ADD_L3",
  "TAX_ADD_L4",
];

function getOutFields(includeMailingAddress) {
  return [
    ...BASE_OUT_FIELDS,
    ...(includeMailingAddress ? MAILING_OUT_FIELDS : []),
  ].join(",");
}

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

function escapeSql(value) {
  return clean(value).replace(/'/g, "''");
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
  const county = COUNTY_LAYERS[filters.county] != null ? filters.county : "Hennepin";
  const cities = Array.isArray(filters.cities)
    ? filters.cities.map(clean).filter(Boolean)
    : [];

  const ownerTypes = Array.isArray(filters.ownerTypes)
    ? filters.ownerTypes.filter((value) =>
        ["individual", "couple", "llc"].includes(value),
      )
    : ["individual", "couple", "llc"];

  return {
    county,
    cities,
    minUnits: clampNumber(filters.minUnits, 2, 1, 999),
    maxUnits: clampNumber(filters.maxUnits, 20, 1, 999),
    minOwnershipYears: clampNumber(filters.minOwnershipYears, 10, 0, 100),
    ownerTypes: ownerTypes.length
      ? ownerTypes
      : ["individual", "couple", "llc"],
    homestead: ["any", "homestead", "non-homestead"].includes(
      filters.homestead,
    )
      ? filters.homestead
      : "any",
    minAssessedValue: clampNumber(
      filters.minAssessedValue,
      0,
      0,
      1000000000,
    ),
    maxAssessedValue: clampNumber(
      filters.maxAssessedValue,
      0,
      0,
      1000000000,
    ),
    builtBefore: clampNumber(filters.builtBefore, 0, 0, 3000),
    minPortfolioSize: clampNumber(filters.minPortfolioSize, 1, 1, 1000),
  };
}

function yearsAgoDate(years) {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return cutoff.toISOString().slice(0, 10);
}

function buildWhere(filters) {
  const clauses = [
    "OWNER_NAME IS NOT NULL",
    `NUM_UNITS >= ${Math.min(filters.minUnits, filters.maxUnits)}`,
    `NUM_UNITS <= ${Math.max(filters.minUnits, filters.maxUnits)}`,
  ];

  if (filters.cities.length) {
    const cityList = filters.cities
      .map((city) => `'${escapeSql(city)}'`)
      .join(",");

    clauses.push(`CTU_NAME IN (${cityList})`);
  }

  if (filters.minOwnershipYears > 0) {
    const cutoffDate = yearsAgoDate(filters.minOwnershipYears);
    clauses.push("SALE_DATE IS NOT NULL");
    clauses.push(
      `SALE_DATE <= TIMESTAMP '${cutoffDate} 00:00:00'`,
    );
  }

  if (filters.minAssessedValue > 0) {
    clauses.push(`EMV_TOTAL >= ${Math.round(filters.minAssessedValue)}`);
  }

  if (filters.maxAssessedValue > 0) {
    clauses.push(`EMV_TOTAL <= ${Math.round(filters.maxAssessedValue)}`);
  }

  if (filters.builtBefore > 0) {
    clauses.push("YEAR_BUILT IS NOT NULL");
    clauses.push(`YEAR_BUILT < ${Math.round(filters.builtBefore)}`);
  }

  return clauses.join(" AND ");
}

async function arcgisQuery(layerId, params) {
  const searchParams = new URLSearchParams({
    returnGeometry: "false",
    f: "json",
    ...params,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      `${PARCEL_SERVICE}/${layerId}/query?${searchParams.toString()}`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
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
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        "MetroGIS did not respond within 15 seconds. Try a narrower search.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCitiesForCounty(county) {
  const layerId = COUNTY_LAYERS[county];
  if (layerId == null) return [];

  const data = await arcgisQuery(layerId, {
    where: "CTU_NAME IS NOT NULL",
    outFields: "CTU_NAME",
    returnDistinctValues: "true",
    orderByFields: "CTU_NAME",
  });

  return [...new Set(
    (data.features || [])
      .map((feature) => clean(feature.attributes?.CTU_NAME))
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
}

async function fetchSourceRows(filters, options = {}) {
  const layerId = COUNTY_LAYERS[filters.county];
  const where = buildWhere(filters);

  const countData = await arcgisQuery(layerId, {
    where,
    returnCountOnly: "true",
  });

  const sourceCount = Number(countData.count) || 0;

  if (sourceCount > MAX_SOURCE_RECORDS) {
    throw new Error(
      `Search is too broad: ${sourceCount.toLocaleString("en-US")} parcel records match the source filters. Narrow the county/cities, unit range, ownership years, value, or build-year filters and search again.`,
    );
  }

  const rows = [];
  let offset = 0;

  while (offset < sourceCount) {
    const data = await arcgisQuery(layerId, {
      where,
      outFields: getOutFields(Boolean(options.includeMailingAddress)),
      orderByFields: "OBJECTID",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
    });

    const features = Array.isArray(data.features) ? data.features : [];

    rows.push(...features.map((feature) => feature.attributes || {}));

    if (!data.exceededTransferLimit || features.length === 0) break;

    offset += features.length;
  }

  return {
    rows,
    sourceCount,
  };
}

function passesPropertyFilters(attributes, ownerType, filters) {
  if (!filters.ownerTypes.includes(ownerType)) return false;
  if (ownerType === "other") return false;
  if (isTaxExempt(attributes.TAX_EXEMPT)) return false;

  const years = ownershipYearsFromSaleDate(attributes.SALE_DATE);
  if (filters.minOwnershipYears > 0) {
    if (years == null || years < filters.minOwnershipYears) return false;
  }

  const homestead = homesteadState(attributes.HOMESTEAD);
  if (filters.homestead !== "any" && homestead !== filters.homestead) {
    return false;
  }

  const assessedValue = Number(attributes.EMV_TOTAL) || 0;
  if (
    filters.minAssessedValue > 0 &&
    assessedValue < filters.minAssessedValue
  ) {
    return false;
  }
  if (
    filters.maxAssessedValue > 0 &&
    assessedValue > filters.maxAssessedValue
  ) {
    return false;
  }

  const yearBuilt = Number(attributes.YEAR_BUILT) || 0;
  if (filters.builtBefore > 0) {
    if (!yearBuilt || yearBuilt >= filters.builtBefore) return false;
  }

  return true;
}

function groupRows(rows, filters) {
  const groups = new Map();

  for (const attributes of rows) {
    const ownerNameRaw = clean(attributes.OWNER_NAME);
    const ownerMoreRaw = clean(attributes.OWNER_MORE);
    const ownerType = classifyOwner(ownerNameRaw, ownerMoreRaw);

    if (!ownerNameRaw) continue;
    if (!passesPropertyFilters(attributes, ownerType, filters)) continue;

    const identityMore =
      ownerType === "couple" ? ownerMoreRaw : "";
    const baseOwnerKey = normalizedKey(
      ownerNameRaw + "|" + identityMore,
    );
    if (!baseOwnerKey) continue;

    const key =
      ownerType === "llc"
        ? `metrogis:entity:${baseOwnerKey}`
        : `metrogis:${filters.county.toLowerCase()}:${baseOwnerKey}`;

    const property = toProperty(attributes, filters.county, ownerType);

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
        (item) => item.parcelId === property.parcelId,
      )
    ) {
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
      const portfolioBonus = Math.min(
        3,
        Math.max(0, prospect.properties.length - 1),
      );

      return {
        ...prospect,
        primaryProperty,
        primaryParcelId: primaryProperty?.parcelId || "",
        propertyCount: prospect.properties.length,
        score: (primaryProperty?.prospectScore || 0) + portfolioBonus,
      };
    })
    .filter(
      (prospect) => prospect.propertyCount >= filters.minPortfolioSize,
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.propertyCount !== a.propertyCount) {
        return b.propertyCount - a.propertyCount;
      }
      return a.ownerNameRaw.localeCompare(b.ownerNameRaw);
    });
}

export async function searchPropertyOwners(
  rawFilters = {},
  options = {},
) {
  const filters = normalizeFilters(rawFilters);
  const source = await fetchSourceRows(filters, {
    includeMailingAddress: Boolean(options.includeMailingAddress),
  });
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
      clampNumber(options.maxOwners, total || 1, 1, 30000),
    );

    return {
      filters,
      sourcePropertyCount: source.sourceCount,
      total,
      prospects: prospects.slice(0, maxOwners),
    };
  }

  const start = (requestedPage - 1) * pageSize;

  return {
    filters,
    sourcePropertyCount: source.sourceCount,
    total,
    page: requestedPage,
    pageSize,
    totalPages,
    prospects: prospects.slice(start, start + pageSize),
  };
}
