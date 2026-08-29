const PARCEL_SERVICE =
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

const PAGE_SIZE = 2000;
const DEFAULT_RESULT_PAGE_SIZE = 25;
const MAX_RESULT_PAGE_SIZE = 100;
const MAX_GROUPS_PER_CITY_LAYER = 20000;
const OWNER_NAME_BATCH_SIZE = 30;

const GROUP_FIELDS = [
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
].join(",");

const DETAIL_FIELDS = [
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

function normalizeCity(value) {
  const raw = clean(value);
  if (!raw) return "";

  if (/^(st\.?|saint)\s+paul$/i.test(raw)) return "St. Paul";

  return raw
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function escapeSqlString(value) {
  return clean(value).replace(/'/g, "''");
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

function mailingKey(mailingAddress) {
  return normalizedKey((mailingAddress?.lines || []).join("|"));
}

function mailingLocationFromAddress(mailingAddress) {
  const lines = mailingAddress?.lines || [];
  if (!lines.length) return "";

  const joined = lines.join(" ");
  if (/\bMINNEAPOLIS\b/i.test(joined)) return "Minneapolis, MN";
  if (/\b(?:SAINT|ST\.?)\s*PAUL\b/i.test(joined)) return "St. Paul, MN";

  return lines[lines.length - 1];
}

function isTaxExempt(value) {
  const normalized = normalizeText(value);

  return ["y", "yes", "true", "tax exempt", "exempt", "1"].includes(
    normalized,
  );
}

function looksPublicOrInstitutional(ownerName) {
  const name = clean(ownerName).toUpperCase();
  if (!name) return true;

  return (
    /^METROPOLITAN COUNCIL$/.test(name) ||
    /^SEC(?:RETARY)? OF VETERANS AFFAIRS$/.test(name) ||
    /^(CITY|COUNTY|STATE|TOWNSHIP|VILLAGE) OF\b/.test(name) ||
    /\bUNITED STATES(?: OF AMERICA)?\b/.test(name) ||
    /\bSCHOOL DISTRICT\b/.test(name) ||
    /\bHOUSING (?:AND )?REDEVELOPMENT AUTHORITY\b/.test(name) ||
    /\bHOUSING AUTHORITY\b/.test(name) ||
    /\bPARK (?:AND )?RECREATION BOARD\b/.test(name) ||
    /\bREGENTS OF THE UNIVERSITY\b/.test(name) ||
    /\bMINNESOTA DEPARTMENT\b/.test(name) ||
    /\bDEPARTMENT OF (?:VETERANS|TRANSPORTATION|NATURAL RESOURCES)\b/.test(name)
  );
}

function ownerIdentity(attributes, county) {
  const ownerNameRaw = clean(attributes.OWNER_NAME);
  if (!ownerNameRaw) return "";

  const address = buildMailingAddress(attributes);
  const addressKey = mailingKey(address);
  const taxNameKey = normalizedKey(attributes.TAX_NAME);

  if (addressKey) {
    return `metrogis:owner:${normalizedKey(ownerNameRaw)}:${addressKey}`;
  }

  if (taxNameKey) {
    return `metrogis:owner:${normalizedKey(ownerNameRaw)}:${taxNameKey}`;
  }

  return `metrogis:${county.toLowerCase()}:owner:${normalizedKey(ownerNameRaw)}`;
}

function normalizeFilters(filters = {}) {
  const city = normalizeCity(filters.city || "Minneapolis");
  const minProperties = Math.round(
    clampNumber(filters.minProperties, 2, 2, 250),
  );
  const maxProperties =
    filters.maxProperties === "" || filters.maxProperties == null
      ? null
      : Math.round(clampNumber(filters.maxProperties, 8, 2, 250));

  if (!city) {
    throw new Error("Choose a city before searching.");
  }

  if (maxProperties != null && minProperties > maxProperties) {
    throw new Error(
      "Property minimum cannot be greater than property maximum.",
    );
  }

  return {
    city,
    minProperties,
    maxProperties,
  };
}

function cityWhere(city, extra = []) {
  const safeCity = escapeSqlString(city);

  return [
    `CTU_NAME = '${safeCity}'`,
    "OWNER_NAME IS NOT NULL",
    ...extra,
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
    throw new Error(
      `MetroGIS request failed with HTTP ${response.status}`,
    );
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

async function findCityCounties(city) {
  const counts = await Promise.all(
    COUNTY_OPTIONS.map(async (county) => {
      const data = await arcgisQuery(COUNTY_LAYERS[county], {
        where: cityWhere(city),
        returnCountOnly: "true",
      });

      return {
        county,
        count: Number(data.count) || 0,
      };
    }),
  );

  return counts.filter((item) => item.count > 0);
}

function summaryFromAttributes(attributes, county, city) {
  const ownerNameRaw = clean(attributes.OWNER_NAME);
  const address = buildMailingAddress(attributes);

  return {
    propertyOutreachKey: ownerIdentity(attributes, county),
    ownerNameRaw,
    ownerMoreRaw: clean(attributes.OWNER_MORE),
    taxNameRaw: clean(attributes.TAX_NAME),
    ownerType: "unknown",
    coOwnerName: "",
    mailingAddress: address,
    mailingLocation: mailingLocationFromAddress(address),
    searchCity: city,
    cityPropertyCount: Number(attributes.PROPERTY_COUNT) || 0,
    propertyCount: Number(attributes.PROPERTY_COUNT) || 0,
    totalAssessedValue: Number(attributes.TOTAL_ASSESSED_VALUE) || 0,
    oldestSaleDate: toIsoDate(attributes.OLDEST_SALE_DATE),
    newestSaleDate: toIsoDate(attributes.NEWEST_SALE_DATE),
    longestHeldYears: ownershipYearsFromSaleDate(
      attributes.OLDEST_SALE_DATE,
    ),
    mostRecentPurchaseYears: ownershipYearsFromSaleDate(
      attributes.NEWEST_SALE_DATE,
    ),
    sourceCounties: [county],
  };
}

async function fetchCountyCitySummaries(county, filters) {
  const layerId = COUNTY_LAYERS[county];
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

  const having = [`COUNT(OBJECTID) >= ${filters.minProperties}`];

  if (filters.maxProperties != null) {
    having.push(`COUNT(OBJECTID) <= ${filters.maxProperties}`);
  }

  const summaries = [];
  let offset = 0;

  while (offset < MAX_GROUPS_PER_CITY_LAYER) {
    const data = await arcgisQuery(layerId, {
      where: cityWhere(filters.city),
      groupByFieldsForStatistics: GROUP_FIELDS,
      outStatistics,
      havingClause: having.join(" AND "),
      orderByFields: "OWNER_NAME ASC",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
    });

    const features = Array.isArray(data.features) ? data.features : [];
    if (!features.length) break;

    for (const feature of features) {
      const summary = summaryFromAttributes(
        feature.attributes || {},
        county,
        filters.city,
      );

      if (
        summary.propertyOutreachKey &&
        !looksPublicOrInstitutional(summary.ownerNameRaw)
      ) {
        summaries.push(summary);
      }
    }

    if (features.length < PAGE_SIZE) break;
    offset += features.length;
  }

  if (offset >= MAX_GROUPS_PER_CITY_LAYER) {
    throw new Error(
      `${filters.city} returned too many grouped owners in ${county}. Raise the property minimum and try again.`,
    );
  }

  return summaries;
}

function mergeCitySummaries(summaryGroups, filters) {
  const merged = new Map();

  for (const summary of summaryGroups.flat()) {
    const existing = merged.get(summary.propertyOutreachKey);

    if (!existing) {
      merged.set(summary.propertyOutreachKey, { ...summary });
      continue;
    }

    existing.cityPropertyCount += summary.cityPropertyCount;
    existing.propertyCount = existing.cityPropertyCount;
    existing.totalAssessedValue += summary.totalAssessedValue;
    existing.sourceCounties = [
      ...new Set([
        ...existing.sourceCounties,
        ...summary.sourceCounties,
      ]),
    ];

    const oldestDates = [
      existing.oldestSaleDate,
      summary.oldestSaleDate,
    ].filter(Boolean);
    const newestDates = [
      existing.newestSaleDate,
      summary.newestSaleDate,
    ].filter(Boolean);

    existing.oldestSaleDate = oldestDates.length
      ? oldestDates.sort()[0]
      : null;
    existing.newestSaleDate = newestDates.length
      ? newestDates.sort().at(-1)
      : null;
    existing.longestHeldYears = ownershipYearsFromSaleDate(
      existing.oldestSaleDate,
    );
    existing.mostRecentPurchaseYears = ownershipYearsFromSaleDate(
      existing.newestSaleDate,
    );

    if (!existing.mailingAddress?.lines?.length) {
      existing.mailingAddress = summary.mailingAddress;
      existing.mailingLocation = summary.mailingLocation;
    }
  }

  return [...merged.values()]
    .filter((summary) => {
      if (summary.cityPropertyCount < filters.minProperties) return false;

      if (
        filters.maxProperties != null &&
        summary.cityPropertyCount > filters.maxProperties
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (b.cityPropertyCount !== a.cityPropertyCount) {
        return b.cityPropertyCount - a.cityPropertyCount;
      }

      const yearsA = a.longestHeldYears ?? -1;
      const yearsB = b.longestHeldYears ?? -1;
      if (yearsB !== yearsA) return yearsB - yearsA;

      if (b.totalAssessedValue !== a.totalAssessedValue) {
        return b.totalAssessedValue - a.totalAssessedValue;
      }

      return a.ownerNameRaw.localeCompare(b.ownerNameRaw);
    });
}

function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function fetchRowsByOwnerNames(county, ownerNames, city = "") {
  if (!ownerNames.length) return [];

  const layerId = COUNTY_LAYERS[county];
  const rows = [];

  for (const batch of chunk(ownerNames, OWNER_NAME_BATCH_SIZE)) {
    const names = batch
      .map((name) => `'${escapeSqlString(name)}'`)
      .join(",");
    let offset = 0;

    while (true) {
      const where = city
        ? cityWhere(city, [`OWNER_NAME IN (${names})`])
        : `OWNER_NAME IN (${names})`;

      const data = await arcgisQuery(layerId, {
        where,
        outFields: DETAIL_FIELDS,
        orderByFields: "OBJECTID ASC",
        resultOffset: String(offset),
        resultRecordCount: String(PAGE_SIZE),
      });

      const features = Array.isArray(data.features)
        ? data.features
        : [];

      rows.push(
        ...features.map((feature) => ({
          county,
          attributes: feature.attributes || {},
        })),
      );

      if (features.length < PAGE_SIZE) break;
      offset += features.length;
    }
  }

  return rows;
}

function toProperty(attributes, county) {
  const parcelId = clean(attributes.COUNTY_PIN);
  const address = buildMailingAddress(attributes);

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
    ownershipYears: ownershipYearsFromSaleDate(
      attributes.SALE_DATE,
    ),
    homestead: clean(attributes.HOMESTEAD),
    dwellingType: clean(attributes.DWELL_TYPE),
    useClass: clean(attributes.USECLASS1),
    ownershipCategory: clean(attributes.OWNERSHIP),
    sourceOwnerName: clean(attributes.OWNER_NAME),
    sourceMailingLocation: mailingLocationFromAddress(address),
  };
}

function cityBreakdown(properties) {
  const counts = new Map();

  for (const property of properties) {
    const city = clean(
      property.municipality || property.city || property.county,
    );

    if (!city) continue;
    counts.set(city, (counts.get(city) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

async function enrichCitySummaries(summaries, city) {
  if (!summaries.length) return [];

  const ownerNames = [
    ...new Set(
      summaries.map((summary) => summary.ownerNameRaw).filter(Boolean),
    ),
  ];

  const counties = [
    ...new Set(
      summaries.flatMap((summary) => summary.sourceCounties || []),
    ),
  ];

  const rows = (
    await Promise.all(
      counties.map((county) =>
        fetchRowsByOwnerNames(county, ownerNames, city),
      ),
    )
  ).flat();

  const summaryMap = new Map(
    summaries.map((summary) => [
      summary.propertyOutreachKey,
      summary,
    ]),
  );
  const grouped = new Map();

  for (const row of rows) {
    const attributes = row.attributes || {};
    if (isTaxExempt(attributes.TAX_EXEMPT)) continue;
    if (looksPublicOrInstitutional(attributes.OWNER_NAME)) continue;

    const key = ownerIdentity(attributes, row.county);
    if (!summaryMap.has(key)) continue;

    const property = toProperty(attributes, row.county);
    if (!property.parcelKey) continue;

    const existing = grouped.get(key) || [];

    if (!existing.some((item) => item.parcelKey === property.parcelKey)) {
      existing.push(property);
    }

    grouped.set(key, existing);
  }

  return summaries.map((summary) => {
    const properties = grouped.get(summary.propertyOutreachKey) || [];

    properties.sort((a, b) => {
      const yearsA = a.ownershipYears ?? -1;
      const yearsB = b.ownershipYears ?? -1;
      if (yearsB !== yearsA) return yearsB - yearsA;
      return (b.assessedValue || 0) - (a.assessedValue || 0);
    });

    return {
      ...summary,
      properties,
      primaryProperty: properties[0] || null,
      primaryParcelId: properties[0]?.parcelId || "",
      cityBreakdown: cityBreakdown(properties),
      locations: [summary.searchCity],
      counties: [
        ...new Set(
          properties.map((property) => property.county).filter(Boolean),
        ),
      ],
      countsReconcile:
        properties.length === summary.cityPropertyCount,
      detailPropertyCount: properties.length,
      mailingInMinneapolis:
        /\bMINNEAPOLIS\b/i.test(
          (summary.mailingAddress?.lines || []).join(" "),
        ),
    };
  });
}

export async function searchPropertyOwners(
  rawFilters = {},
  options = {},
) {
  const filters = normalizeFilters(rawFilters);
  const cityCounties = await findCityCounties(filters.city);

  if (!cityCounties.length) {
    return {
      filters,
      total: 0,
      page: 1,
      pageSize: Number(options.pageSize) || DEFAULT_RESULT_PAGE_SIZE,
      totalPages: 1,
      matchedPropertyCount: 0,
      sourcePropertyCount: 0,
      searchedCounties: [],
      prospects: [],
    };
  }

  const summaryGroups = await Promise.all(
    cityCounties.map(({ county }) =>
      fetchCountyCitySummaries(county, filters),
    ),
  );
  const summaries = mergeCitySummaries(summaryGroups, filters);
  const total = summaries.length;
  const matchedPropertyCount = summaries.reduce(
    (sum, summary) => sum + summary.cityPropertyCount,
    0,
  );

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
  const page = Math.round(
    clampNumber(options.page, 1, 1, totalPages),
  );

  let selectedSummaries;

  if (selectedKeys.size) {
    selectedSummaries = summaries.filter((summary) =>
      selectedKeys.has(summary.propertyOutreachKey),
    );
  } else if (!paginate) {
    const maxOwners = Math.round(
      clampNumber(options.maxOwners, total || 1, 1, 50000),
    );
    selectedSummaries = summaries.slice(0, maxOwners);
  } else {
    const start = (page - 1) * pageSize;
    selectedSummaries = summaries.slice(start, start + pageSize);
  }

  const prospects =
    options.includeDetails === false
      ? selectedSummaries
      : await enrichCitySummaries(selectedSummaries, filters.city);

  return {
    filters,
    total,
    page,
    pageSize,
    totalPages,
    matchedPropertyCount,
    sourcePropertyCount: matchedPropertyCount,
    searchedCounties: cityCounties.map((item) => item.county),
    prospects,
  };
}

export async function lookupMetroPropertiesForProspect(prospect) {
  const ownerNameRaw = clean(prospect?.ownerNameRaw);

  if (!ownerNameRaw) {
    throw new Error("This prospect does not have an owner name to look up.");
  }

  const seedProperties = Array.isArray(prospect.properties)
    ? prospect.properties.filter((property) => property?.parcelKey)
    : [];
  const seedParcelKeys = new Set(
    seedProperties.map((property) => property.parcelKey),
  );
  const seedMailingKey = mailingKey(prospect.mailingAddress);

  const rows = (
    await Promise.all(
      COUNTY_OPTIONS.map((county) =>
        fetchRowsByOwnerNames(county, [ownerNameRaw]),
      ),
    )
  ).flat();

  const confirmedByParcel = new Map(
    seedProperties.map((property) => [
      property.parcelKey,
      {
        ...property,
        matchReason: "Saved city property",
      },
    ]),
  );
  const possibleByParcel = new Map();

  for (const row of rows) {
    const attributes = row.attributes || {};

    if (looksPublicOrInstitutional(attributes.OWNER_NAME)) continue;
    if (isTaxExempt(attributes.TAX_EXEMPT)) continue;

    const property = toProperty(attributes, row.county);
    if (!property.parcelKey) continue;

    if (seedParcelKeys.has(property.parcelKey)) {
      confirmedByParcel.set(property.parcelKey, {
        ...property,
        matchReason: "Saved city property",
      });
      continue;
    }

    const rowAddress = buildMailingAddress(attributes);
    const rowMailingKey = mailingKey(rowAddress);

    if (
      seedMailingKey &&
      rowMailingKey &&
      seedMailingKey === rowMailingKey
    ) {
      confirmedByParcel.set(property.parcelKey, {
        ...property,
        matchReason: "Exact owner name + matching mailing address",
      });
      continue;
    }

    possibleByParcel.set(property.parcelKey, {
      ...property,
      matchReason:
        "Same owner name, but the mailing address is different or unavailable",
      candidateMailingLocation:
        mailingLocationFromAddress(rowAddress),
    });
  }

  const confirmedProperties = [...confirmedByParcel.values()].sort(
    (a, b) => {
      const cityCompare = clean(a.municipality).localeCompare(
        clean(b.municipality),
      );

      if (cityCompare !== 0) return cityCompare;
      return clean(a.street1).localeCompare(clean(b.street1));
    },
  );
  const possibleProperties = [...possibleByParcel.values()].sort(
    (a, b) => {
      const cityCompare = clean(a.municipality).localeCompare(
        clean(b.municipality),
      );

      if (cityCompare !== 0) return cityCompare;
      return clean(a.street1).localeCompare(clean(b.street1));
    },
  );

  const confirmedBreakdown = cityBreakdown(confirmedProperties);
  const searchCity = normalizeCity(prospect.searchCity || "");
  const additionalConfirmedProperties = confirmedProperties.filter(
    (property) => !seedParcelKeys.has(property.parcelKey),
  );
  const additionalBreakdown = cityBreakdown(
    additionalConfirmedProperties,
  );

  return {
    checkedAt: new Date().toISOString(),
    ownerNameQueried: ownerNameRaw,
    seedMailingAvailable: Boolean(seedMailingKey),
    searchCity,
    cityPropertyCount:
      Number(prospect.cityPropertyCount) ||
      seedProperties.length,
    confirmedPropertyCount: confirmedProperties.length,
    additionalConfirmedCount: additionalConfirmedProperties.length,
    possibleMatchCount: possibleProperties.length,
    confirmedCityBreakdown: confirmedBreakdown,
    additionalCityBreakdown: additionalBreakdown,
    confirmedProperties,
    additionalConfirmedProperties,
    possibleProperties,
  };
}
