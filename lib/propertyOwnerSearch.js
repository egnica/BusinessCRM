const OWNER_SUMMARY_SERVICE =
  "https://arcgis.metc.state.mn.us/server/rest/services/EnterpriseLibrary/PublicParcelsMetroCTUs/FeatureServer/0";
const PARCEL_POINT_SERVICE =
  "https://arcgis.metc.state.mn.us/data1/rest/services/parcels/Parcel_Points/FeatureServer";

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

const SUMMARY_PAGE_SIZE = 4000;
const DETAIL_PAGE_SIZE = 2000;
const DEFAULT_RESULT_PAGE_SIZE = 25;
const MAX_RESULT_PAGE_SIZE = 100;
const MAX_SUMMARY_GROUPS = 50000;
const MAX_CITY_OWNER_KEYS = 150000;
const OWNER_NAME_BATCH_SIZE = 35;

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
  const parcelId = clean(attributes.COUNTY_PIN);

  return {
    parcelId,
    parcelKey: parcelId ? `${county}:${parcelId}` : "",
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

function escapeSqlString(value) {
  return clean(value).replace(/'/g, "''");
}

function mailingLocationFromAddress(mailingAddress) {
  const lines = mailingAddress?.lines || [];
  if (!lines.length) return "";

  const joined = lines.join(" ");
  if (/\bMINNEAPOLIS\b/i.test(joined)) return "Minneapolis, MN";
  if (/\b(?:SAINT|ST\.?)[\s-]*PAUL\b/i.test(joined)) return "St. Paul, MN";

  return lines[lines.length - 1];
}

function normalizeFilters(filters = {}) {
  const minProperties = Math.round(
    clampNumber(
      filters.minProperties ?? filters.minPortfolioSize,
      2,
      2,
      250,
    ),
  );

  const maxRaw = filters.maxProperties ?? filters.maxPortfolioSize;
  const maxProperties =
    maxRaw === "" || maxRaw == null
      ? null
      : Math.round(clampNumber(maxRaw, 8, 2, 250));

  if (maxProperties != null && minProperties > maxProperties) {
    throw new Error(
      "Property minimum cannot be greater than property maximum.",
    );
  }

  const allowedOwnerTypes = new Set(["individual", "couple", "llc"]);
  const requestedOwnerTypes = Array.isArray(filters.ownerTypes)
    ? filters.ownerTypes
    : clean(filters.ownerTypes)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
  const ownerTypes = requestedOwnerTypes.filter((value) =>
    allowedOwnerTypes.has(value),
  );

  return {
    minProperties,
    maxProperties,
    ownerTypes: ownerTypes.length
      ? [...new Set(ownerTypes)]
      : ["individual", "couple", "llc"],
    city: clean(filters.city),
  };
}

function buildResidentialWhere(extra = []) {
  const residentialSignals = [
    "UPPER(USECLASS1) LIKE '%RESID%'",
    "UPPER(USECLASS1) LIKE '%APART%'",
    "UPPER(USECLASS1) LIKE '%MULTI%'",
    "UPPER(USECLASS1) LIKE '%DUPLEX%'",
    "UPPER(USECLASS1) LIKE '%TRIPLEX%'",
    "UPPER(USECLASS1) LIKE '%FOURPLEX%'",
  ];

  return [
    "OWNER_NAME IS NOT NULL",
    "(TAX_EXEMPT IS NULL OR UPPER(TAX_EXEMPT) NOT IN ('Y','YES','TRUE','EXEMPT'))",
    `(${residentialSignals.join(" OR ")})`,
    ...extra,
  ].join(" AND ");
}

async function arcgisQuery(baseUrl, params) {
  const searchParams = new URLSearchParams({
    returnGeometry: "false",
    f: "json",
    ...params,
  });

  const response = await fetch(`${baseUrl}/query?${searchParams.toString()}`, {
    cache: "no-store",
  });

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

function summaryIdentityKey(ownerName, taxName, ownerType) {
  const ownerKey = normalizedKey(ownerName);
  if (!ownerKey) return "";

  if (ownerType === "llc") {
    return `metrogis:entity:${ownerKey}`;
  }

  const taxKey = normalizedKey(taxName);
  return `metrogis:owner:${ownerKey}:${taxKey || ownerKey}`;
}

function summaryFromAttributes(attributes) {
  const ownerNameRaw = clean(attributes.OWNER_NAME);
  const taxNameRaw = clean(attributes.TAX_NAME);
  const ownerType = classifyOwner(ownerNameRaw);
  const propertyOutreachKey = summaryIdentityKey(
    ownerNameRaw,
    taxNameRaw,
    ownerType,
  );
  const oldestSaleDate = toIsoDate(attributes.OLDEST_SALE_DATE);
  const newestSaleDate = toIsoDate(attributes.NEWEST_SALE_DATE);

  return {
    propertyOutreachKey,
    ownerNameRaw,
    ownerMoreRaw: taxNameRaw,
    taxNameRaw,
    ownerType,
    coOwnerName: ownerType === "couple" ? taxNameRaw : "",
    propertyCount: Number(attributes.PROPERTY_COUNT) || 0,
    totalAssessedValue: Number(attributes.TOTAL_ASSESSED_VALUE) || 0,
    oldestSaleDate,
    newestSaleDate,
    longestHeldYears: ownershipYearsFromSaleDate(oldestSaleDate),
    mostRecentPurchaseYears: ownershipYearsFromSaleDate(newestSaleDate),
    score: 0,
  };
}

async function fetchOwnerSummaries(filters) {
  const having = [`COUNT(OBJECTID) >= ${filters.minProperties}`];
  if (filters.maxProperties != null) {
    having.push(`COUNT(OBJECTID) <= ${filters.maxProperties}`);
  }

  const outStatistics = JSON.stringify([
    {
      statisticType: "count",
      onStatisticField: "OBJECTID",
      outStatisticFieldName: "PROPERTY_COUNT",
    },
    {
      statisticType: "sum",
      onStatisticField: "EMV_TOTAL",
      outStatisticFieldName: "TOTAL_ASSESSED_VALUE",
    },
    {
      statisticType: "min",
      onStatisticField: "SALE_DATE",
      outStatisticFieldName: "OLDEST_SALE_DATE",
    },
    {
      statisticType: "max",
      onStatisticField: "SALE_DATE",
      outStatisticFieldName: "NEWEST_SALE_DATE",
    },
  ]);

  const summaries = [];
  const seenPageSignatures = new Set();
  let offset = 0;

  while (offset < MAX_SUMMARY_GROUPS) {
    const data = await arcgisQuery(OWNER_SUMMARY_SERVICE, {
      where: buildResidentialWhere(),
      groupByFieldsForStatistics: "OWNER_NAME,TAX_NAME",
      outStatistics,
      havingClause: having.join(" AND "),
      orderByFields: "OWNER_NAME ASC,TAX_NAME ASC",
      resultOffset: String(offset),
      resultRecordCount: String(SUMMARY_PAGE_SIZE),
    });

    const features = Array.isArray(data.features) ? data.features : [];
    if (!features.length) break;

    const signature = features
      .slice(0, 3)
      .map((feature) => {
        const attributes = feature.attributes || {};
        return `${clean(attributes.OWNER_NAME)}|${clean(attributes.TAX_NAME)}`;
      })
      .join("||");

    if (seenPageSignatures.has(signature)) {
      throw new Error(
        "MetroGIS could not paginate the owner summary cleanly. Try a narrower property range.",
      );
    }
    seenPageSignatures.add(signature);

    summaries.push(
      ...features
        .map((feature) => summaryFromAttributes(feature.attributes || {}))
        .filter((summary) => summary.propertyOutreachKey),
    );

    if (features.length < SUMMARY_PAGE_SIZE) break;
    offset += features.length;
  }

  if (summaries.length >= MAX_SUMMARY_GROUPS) {
    throw new Error(
      `This search returned more than ${MAX_SUMMARY_GROUPS.toLocaleString("en-US")} owners. Use a smaller property range.`,
    );
  }

  return summaries;
}

function buildCityWhere(city) {
  const safeCity = escapeSqlString(city.toUpperCase());
  return buildResidentialWhere([
    `UPPER(CTU_NAME) LIKE '%${safeCity}%'`,
  ]);
}

async function fetchCityOwnerKeys(city) {
  if (!city) return null;

  const keys = new Set();
  const seenPageSignatures = new Set();
  let offset = 0;

  while (offset < MAX_CITY_OWNER_KEYS) {
    const data = await arcgisQuery(OWNER_SUMMARY_SERVICE, {
      where: buildCityWhere(city),
      outFields: "OWNER_NAME,TAX_NAME",
      returnDistinctValues: "true",
      orderByFields: "OWNER_NAME ASC,TAX_NAME ASC",
      resultOffset: String(offset),
      resultRecordCount: String(SUMMARY_PAGE_SIZE),
    });

    const features = Array.isArray(data.features) ? data.features : [];
    if (!features.length) break;

    const signature = features
      .slice(0, 3)
      .map((feature) => {
        const attributes = feature.attributes || {};
        return `${clean(attributes.OWNER_NAME)}|${clean(attributes.TAX_NAME)}`;
      })
      .join("||");

    if (seenPageSignatures.has(signature)) {
      throw new Error(
        "MetroGIS could not paginate the city owner list cleanly. Try searching without the city filter.",
      );
    }
    seenPageSignatures.add(signature);

    for (const feature of features) {
      const attributes = feature.attributes || {};
      const ownerNameRaw = clean(attributes.OWNER_NAME);
      const taxNameRaw = clean(attributes.TAX_NAME);
      const ownerType = classifyOwner(ownerNameRaw);
      const key = summaryIdentityKey(ownerNameRaw, taxNameRaw, ownerType);
      if (key) keys.add(key);
    }

    if (features.length < SUMMARY_PAGE_SIZE) break;
    offset += features.length;
  }

  if (keys.size >= MAX_CITY_OWNER_KEYS) {
    throw new Error(
      "That city contains too many owner records for a focused search. Add a tighter property maximum or search without the city filter.",
    );
  }

  return keys;
}

function sortSummaries(a, b) {
  if (b.propertyCount !== a.propertyCount) {
    return b.propertyCount - a.propertyCount;
  }

  const yearsA = a.longestHeldYears ?? -1;
  const yearsB = b.longestHeldYears ?? -1;
  if (yearsB !== yearsA) return yearsB - yearsA;

  if (b.totalAssessedValue !== a.totalAssessedValue) {
    return b.totalAssessedValue - a.totalAssessedValue;
  }

  return a.ownerNameRaw.localeCompare(b.ownerNameRaw);
}

async function getFilteredSummaries(filters) {
  const [summaries, cityKeys] = await Promise.all([
    fetchOwnerSummaries(filters),
    filters.city ? fetchCityOwnerKeys(filters.city) : Promise.resolve(null),
  ]);

  const allowedTypes = new Set(filters.ownerTypes);

  return summaries
    .filter((summary) => allowedTypes.has(summary.ownerType))
    .filter((summary) => !cityKeys || cityKeys.has(summary.propertyOutreachKey))
    .sort(sortSummaries);
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchCountyDetailRows(county, ownerNames) {
  if (!ownerNames.length) return [];

  const layerId = COUNTY_LAYERS[county];
  const rows = [];

  for (const nameBatch of chunk(ownerNames, OWNER_NAME_BATCH_SIZE)) {
    const ownerSql = nameBatch
      .map((name) => `'${escapeSqlString(name)}'`)
      .join(",");
    let offset = 0;

    while (true) {
      const data = await arcgisQuery(
        `${PARCEL_POINT_SERVICE}/${layerId}`,
        {
          where: buildResidentialWhere([
            `OWNER_NAME IN (${ownerSql})`,
          ]),
          outFields: OUT_FIELDS,
          orderByFields: "OBJECTID ASC",
          resultOffset: String(offset),
          resultRecordCount: String(DETAIL_PAGE_SIZE),
        },
      );

      const features = Array.isArray(data.features) ? data.features : [];
      rows.push(
        ...features.map((feature) => ({
          county,
          attributes: feature.attributes || {},
        })),
      );

      if (features.length < DETAIL_PAGE_SIZE) break;
      offset += features.length;
    }
  }

  return rows;
}

async function fetchDetailRows(summaries) {
  if (!summaries.length) return [];

  const ownerNames = [
    ...new Set(summaries.map((summary) => summary.ownerNameRaw).filter(Boolean)),
  ];

  const countyRows = await Promise.all(
    COUNTY_OPTIONS.map((county) => fetchCountyDetailRows(county, ownerNames)),
  );

  return countyRows.flat();
}

function cityBreakdownFromProperties(properties) {
  const counts = new Map();

  for (const property of properties) {
    const city = clean(property.municipality || property.city || property.county);
    if (!city) continue;
    counts.set(city, (counts.get(city) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

function enrichSummariesWithDetails(summaries, rows) {
  const summaryMap = new Map(
    summaries.map((summary) => [summary.propertyOutreachKey, summary]),
  );
  const grouped = new Map();

  for (const row of rows) {
    const attributes = row.attributes || {};
    const ownerNameRaw = clean(attributes.OWNER_NAME);
    const taxNameRaw = clean(attributes.TAX_NAME);
    const detailOwnerType = classifyOwner(
      ownerNameRaw,
      clean(attributes.OWNER_MORE),
    );
    const summaryType = classifyOwner(ownerNameRaw);
    const key = summaryIdentityKey(ownerNameRaw, taxNameRaw, summaryType);
    const summary = summaryMap.get(key);

    if (!summary) continue;
    if (isTaxExempt(attributes.TAX_EXEMPT)) continue;

    const property = toProperty(attributes, row.county, detailOwnerType);
    if (!property.parcelId || !property.street1) continue;

    const existing = grouped.get(key) || {
      ...summary,
      ownerType: summary.ownerType,
      coOwnerName:
        summary.ownerType === "couple"
          ? clean(attributes.OWNER_MORE) || summary.coOwnerName
          : "",
      mailingAddress: buildMailingAddress(attributes),
      properties: [],
    };

    if (!existing.mailingAddress?.lines?.length) {
      existing.mailingAddress = buildMailingAddress(attributes);
    }

    if (
      !existing.properties.some(
        (item) =>
          item.parcelKey === property.parcelKey ||
          (item.parcelId === property.parcelId &&
            item.county === property.county),
      )
    ) {
      existing.properties.push(property);
    }

    grouped.set(key, existing);
  }

  return summaries.map((summary) => {
    const prospect = grouped.get(summary.propertyOutreachKey) || {
      ...summary,
      mailingAddress: {
        source: "",
        recipientName: summary.ownerNameRaw,
        lines: [],
      },
      properties: [],
    };

    prospect.properties.sort((a, b) => {
      const yearsA = a.ownershipYears ?? -1;
      const yearsB = b.ownershipYears ?? -1;
      if (yearsB !== yearsA) return yearsB - yearsA;
      return (b.prospectScore || 0) - (a.prospectScore || 0);
    });

    const primaryProperty = prospect.properties[0] || null;
    const detailedPropertyCount = prospect.properties.length;
    const propertyCount = Math.max(summary.propertyCount, detailedPropertyCount);
    const knownUnitProperties = prospect.properties.filter(
      (property) => property.numUnits != null,
    );
    const totalUnits = knownUnitProperties.reduce(
      (sum, property) => sum + property.numUnits,
      0,
    );
    const detailAssessedValue = prospect.properties.reduce(
      (sum, property) => sum + (Number(property.assessedValue) || 0),
      0,
    );
    const detailLongestHeld = prospect.properties.reduce(
      (longest, property) =>
        property.ownershipYears == null
          ? longest
          : Math.max(longest, property.ownershipYears),
      -1,
    );
    const cityBreakdown = cityBreakdownFromProperties(prospect.properties);
    const counties = [
      ...new Set(
        prospect.properties.map((property) => property.county).filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
    const mailingLocation = mailingLocationFromAddress(prospect.mailingAddress);
    const mailingText = (prospect.mailingAddress?.lines || []).join(" ");
    const ownsInMinneapolis = cityBreakdown.some(
      (item) => normalizeText(item.city) === "minneapolis",
    );

    return {
      ...prospect,
      primaryProperty,
      primaryParcelId: primaryProperty?.parcelId || "",
      propertyCount,
      totalUnits,
      knownUnitPropertyCount: knownUnitProperties.length,
      totalAssessedValue:
        detailAssessedValue || summary.totalAssessedValue || 0,
      longestHeldYears:
        detailLongestHeld >= 0
          ? detailLongestHeld
          : summary.longestHeldYears,
      mostRecentPurchaseYears: summary.mostRecentPurchaseYears,
      cityBreakdown,
      locations: cityBreakdown.map((item) => item.city),
      counties,
      mailingLocation,
      ownsInMinneapolis,
      mailingInMinneapolis: /\bMINNEAPOLIS\b/i.test(mailingText),
      score:
        (primaryProperty?.prospectScore || 0) +
        Math.min(8, Math.max(0, propertyCount - 1)),
    };
  });
}

export async function searchPropertyOwners(rawFilters = {}, options = {}) {
  const filters = normalizeFilters(rawFilters);
  const allSummaries = await getFilteredSummaries(filters);
  const total = allSummaries.length;
  const matchedPropertyCount = allSummaries.reduce(
    (sum, summary) => sum + summary.propertyCount,
    0,
  );
  const includeDetails = options.includeDetails !== false;
  const selectedKeys = new Set(
    Array.isArray(options.selectedKeys)
      ? options.selectedKeys.filter(Boolean)
      : [],
  );
  const paginate = options.paginate !== false;
  const pageSize = Math.round(
    clampNumber(
      options.pageSize,
      DEFAULT_RESULT_PAGE_SIZE,
      1,
      MAX_RESULT_PAGE_SIZE,
    ),
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Math.round(
    clampNumber(options.page, 1, 1, totalPages),
  );

  let selectedSummaries;

  if (selectedKeys.size) {
    selectedSummaries = allSummaries.filter((summary) =>
      selectedKeys.has(summary.propertyOutreachKey),
    );
  } else if (!paginate) {
    const maxOwners = Math.round(
      clampNumber(options.maxOwners, total || 1, 1, 50000),
    );
    selectedSummaries = allSummaries.slice(0, maxOwners);
  } else {
    const start = (requestedPage - 1) * pageSize;
    selectedSummaries = allSummaries.slice(start, start + pageSize);
  }

  const prospects = includeDetails
    ? enrichSummariesWithDetails(
        selectedSummaries,
        await fetchDetailRows(selectedSummaries),
      )
    : selectedSummaries;

  if (!paginate) {
    return {
      filters,
      sourcePropertyCount: matchedPropertyCount,
      matchedPropertyCount,
      searchedCounties: COUNTY_OPTIONS,
      total,
      prospects,
    };
  }

  return {
    filters,
    sourcePropertyCount: matchedPropertyCount,
    matchedPropertyCount,
    searchedCounties: COUNTY_OPTIONS,
    total,
    page: requestedPage,
    pageSize,
    totalPages,
    prospects,
  };
}
