export const IMPORT_FIELD_DEFINITIONS = [
  { key: "firstName", label: "First Name", aliases: ["first name", "firstname", "given name", "contact first name"] },
  { key: "lastName", label: "Last Name", aliases: ["last name", "lastname", "surname", "family name", "contact last name"] },
  { key: "fullName", label: "Full Name", aliases: ["name", "full name", "contact name", "contact"] },
  { key: "ownerType", label: "Owner Type", aliases: ["owner type", "contact type", "entity type"] },
  { key: "coOwnerName", label: "Co-owner Name", aliases: ["co owner", "co-owner", "co owner name", "co-owner name"] },
  { key: "project", label: "Project", aliases: ["project"] },
  { key: "jobTitle", label: "Job Title", aliases: ["job title", "title", "position", "role"] },
  { key: "email", label: "Email", aliases: ["email", "email address", "e-mail", "work email"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phone number", "telephone", "mobile", "cell"] },
  { key: "companyName", label: "Company Name", aliases: ["company", "company name", "business", "business name", "organization", "organisation"] },
  { key: "companyWebsite", label: "Company Website", aliases: ["company website", "business website", "website", "company url", "business url", "url"] },
  { key: "addressStreet1", label: "Address Line 1", aliases: ["address", "address 1", "address line 1", "street", "street address", "mailing address"] },
  { key: "addressStreet2", label: "Address Line 2", aliases: ["address 2", "address line 2", "suite", "unit"] },
  { key: "city", label: "City", aliases: ["city", "mailing city"] },
  { key: "state", label: "State", aliases: ["state", "province", "region"] },
  { key: "zip", label: "ZIP / Postal Code", aliases: ["zip", "zipcode", "zip code", "postal code", "postal"] },
  { key: "country", label: "Country", aliases: ["country"] },
  { key: "linkedin", label: "LinkedIn", aliases: ["linkedin", "linkedin url", "linkedin profile"] },
  { key: "rank", label: "Rank", aliases: ["rank", "priority", "lead rank"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "comments", "comment"] },
  { key: "propertyStreet1", label: "Property Address Line 1", aliases: ["property address", "property street", "property address 1"] },
  { key: "propertyStreet2", label: "Property Address Line 2", aliases: ["property address 2", "property unit"] },
  { key: "propertyCity", label: "Property City", aliases: ["property city"] },
  { key: "propertyState", label: "Property State", aliases: ["property state"] },
  { key: "propertyZip", label: "Property ZIP", aliases: ["property zip", "property postal code"] },
  { key: "propertyCountry", label: "Property Country", aliases: ["property country"] },
];

const clean = (value) => (value == null ? "" : String(value).trim());

function headerKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function guessImportField(header) {
  const target = headerKey(header);
  if (!target) return "";

  for (const field of IMPORT_FIELD_DEFINITIONS) {
    if (headerKey(field.label) === target) return field.key;
    if (field.aliases.some((alias) => headerKey(alias) === target)) return field.key;
  }

  return "";
}

export function parseCsvText(text) {
  if (typeof text !== "string") throw new Error("CSV data must be text.");

  const input = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    pushField();
    if (row.some((cell) => clean(cell) !== "")) rows.push(row);
    row = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      pushRow();
      continue;
    }

    field += char;
  }

  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  if (field !== "" || row.length) pushRow();
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one contact row.");

  const headers = rows[0].map((header, index) => clean(header) || "Column " + (index + 1));
  return { headers, rows: rows.slice(1) };
}

export function mapCsvRows(headers, rows, mapping) {
  return rows.map((row) => {
    const mapped = {};
    headers.forEach((_header, index) => {
      const key = mapping[index];
      if (!key) return;
      const value = clean(row[index]);
      if (value !== "") mapped[key] = value;
    });
    return mapped;
  });
}

// Additional import values only fill fields missing from a CSV row.
export const IMPORT_ADDITIONAL_FIELDS = [
  ...IMPORT_FIELD_DEFINITIONS.filter((field) => !["fullName", "firstName", "lastName"].includes(field.key)),
  { key: "emailStatus", label: "Email Status", aliases: [] },
];

export function applyAdditionalImportFields(raw, fields = []) {
  const result = { ...raw };
  const allowed = new Set(IMPORT_ADDITIONAL_FIELDS.map((field) => field.key));
  if (!Array.isArray(fields)) return result;
  for (const entry of fields.slice(0, allowed.size)) {
    if (!entry || !allowed.has(entry.key) || clean(result[entry.key])) continue;
    let value = clean(entry.value);
    if (!value) continue;
    if (entry.key === "emailStatus") {
      value = value.toLowerCase();
      if (!["unknown", "subscribed", "unsubscribed"].includes(value)) continue;
    }
    result[entry.key] = value.slice(0, 2000);
  }
  return result;
}

function normalizeOwnerType(value, hasCompletePerson, hasCompany) {
  const normalized = clean(value).toLowerCase();
  if (["llc", "company", "business", "entity", "organization", "organisation"].includes(normalized)) return "llc";
  if (["couple", "partners", "partnership"].includes(normalized)) return "couple";
  if (normalized === "other") return "other";
  if (["individual", "person", "owner"].includes(normalized)) return "individual";
  if (hasCompany && !hasCompletePerson) return "llc";
  return "individual";
}

function splitFullName(fullName) {
  const parts = clean(fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

export function normalizePhone(value) {
  let digits = clean(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length >= 7 ? digits : "";
}

export function normalizeLinkedIn(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

function normalizeCompany(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(l\.?l\.?c\.?|incorporated|inc\.?|corporation|corp\.?|company|co\.?)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeName(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function normalizeImportRow(raw, metadata = {}) {
  const fullName = splitFullName(raw.fullName);
  const firstName = clean(raw.firstName) || fullName.firstName;
  const lastName = clean(raw.lastName) || fullName.lastName;
  const companyName = clean(raw.companyName);
  const hasCompletePerson = Boolean(firstName && lastName);
  const hasCompany = Boolean(companyName);
  const ownerType = normalizeOwnerType(raw.ownerType, hasCompletePerson, hasCompany);
  const email = clean(raw.email);
  const now = metadata.now || new Date().toISOString();

  const errors = [];
  if (!hasCompletePerson && !hasCompany) {
    errors.push("Add a first and last name or a company name.");
  }
  if (ownerType === "llc" && !hasCompany) {
    errors.push("LLC / entity rows need a company name.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Email address is not valid.");
  }

  const contact = {
    firstName,
    lastName,
    ownerType,
    coOwnerName: clean(raw.coOwnerName),
    project: clean(raw.project),
    jobTitle: clean(raw.jobTitle),
    email,
    phone: clean(raw.phone),
    company: {
      name: companyName,
      website: clean(raw.companyWebsite),
      industry: "",
    },
    address: {
      street1: clean(raw.addressStreet1),
      street2: clean(raw.addressStreet2),
      city: clean(raw.city),
      state: clean(raw.state),
      zip: clean(raw.zip),
      country: clean(raw.country) || "US",
    },
    property: {
      street1: clean(raw.propertyStreet1),
      street2: clean(raw.propertyStreet2),
      city: clean(raw.propertyCity),
      state: clean(raw.propertyState),
      zip: clean(raw.propertyZip),
      country: clean(raw.propertyCountry) || "US",
    },
    rank: clean(raw.rank) || "D",
    relationshipType: "",
    facebook: "",
    linkedin: clean(raw.linkedin),
    website: "",
    serviceInterest: [],
    birthday: null,
    notes: clean(raw.notes),
    emailStatus: ["unknown", "subscribed", "unsubscribed"].includes(clean(raw.emailStatus).toLowerCase()) ? clean(raw.emailStatus).toLowerCase() : "unknown",
    introEmail: {
      status: "pending",
      sent: false,
      sentAt: null,
      cancelledAt: null,
    },
    lastContact: {
      date: null,
      type: "",
      notes: "",
    },
    nextFollowUp: null,
    createdAt: now,
    updatedAt: now,
  };

  if (metadata.batchId) contact.importBatchId = metadata.batchId;
  if (metadata.fileName) contact.importFileName = metadata.fileName;
  if (metadata.batchId || metadata.fileName) {
    contact.importSource = "csv";
    contact.importedAt = now;
  }

  return { contact, errors };
}

export function buildImportUpdateSet(raw, contact, metadata = {}) {
  const update = { updatedAt: metadata.now || new Date().toISOString() };
  const has = (key) => clean(raw[key]) !== "";
  const set = (key, value) => { if (value !== undefined) update[key] = value; };

  if (has("firstName") || has("fullName")) set("firstName", contact.firstName);
  if (has("lastName") || has("fullName")) set("lastName", contact.lastName);
  if (has("ownerType")) set("ownerType", contact.ownerType);
  if (has("coOwnerName")) set("coOwnerName", contact.coOwnerName);
  if (has("project")) set("project", contact.project);
  if (has("jobTitle")) set("jobTitle", contact.jobTitle);
  if (has("email")) set("email", contact.email);
  if (has("phone")) set("phone", contact.phone);
  if (has("companyName")) set("company.name", contact.company.name);
  if (has("companyWebsite")) set("company.website", contact.company.website);
  if (has("addressStreet1")) set("address.street1", contact.address.street1);
  if (has("addressStreet2")) set("address.street2", contact.address.street2);
  if (has("city")) set("address.city", contact.address.city);
  if (has("state")) set("address.state", contact.address.state);
  if (has("zip")) set("address.zip", contact.address.zip);
  if (has("country")) set("address.country", contact.address.country);
  if (has("propertyStreet1")) set("property.street1", contact.property.street1);
  if (has("propertyStreet2")) set("property.street2", contact.property.street2);
  if (has("propertyCity")) set("property.city", contact.property.city);
  if (has("propertyState")) set("property.state", contact.property.state);
  if (has("propertyZip")) set("property.zip", contact.property.zip);
  if (has("propertyCountry")) set("property.country", contact.property.country);
  if (has("linkedin")) set("linkedin", contact.linkedin);
  if (has("rank")) set("rank", contact.rank);
  if (has("notes")) set("notes", contact.notes);

  if (metadata.batchId) {
    set("importSource", "csv");
    set("importBatchId", metadata.batchId);
    set("importedAt", metadata.now || new Date().toISOString());
  }
  if (metadata.fileName) set("importFileName", metadata.fileName);

  return update;
}

function contactLabel(contact) {
  const person = [clean(contact.firstName), clean(contact.lastName)].filter(Boolean).join(" ");
  return person || clean(contact.company?.name) || "Existing contact";
}

export function createDuplicateIndex(contacts = []) {
  const index = {
    email: new Map(),
    phone: new Map(),
    linkedin: new Map(),
    personCompany: new Map(),
    company: new Map(),
  };

  contacts.forEach((contact) => addContactToDuplicateIndex(index, contact, { source: "database" }));
  return index;
}

export function addContactToDuplicateIndex(index, contact, metadata = {}) {
  const entry = {
    id: contact._id ? String(contact._id) : metadata.id || "",
    source: metadata.source || "database",
    rowIndex: metadata.rowIndex ?? null,
    label: contactLabel(contact),
  };

  const email = normalizeEmail(contact.email);
  const phone = normalizePhone(contact.phone);
  const linkedin = normalizeLinkedIn(contact.linkedin);
  const company = normalizeCompany(contact.company?.name);
  const first = normalizeName(contact.firstName);
  const last = normalizeName(contact.lastName);

  if (email && !index.email.has(email)) index.email.set(email, entry);
  if (phone && !index.phone.has(phone)) index.phone.set(phone, entry);
  if (linkedin && !index.linkedin.has(linkedin)) index.linkedin.set(linkedin, entry);
  if (first && last && company) {
    const key = first + "|" + last + "|" + company;
    if (!index.personCompany.has(key)) index.personCompany.set(key, entry);
  }
  if (company && (contact.ownerType === "llc" || (!first && !last))) {
    if (!index.company.has(company)) index.company.set(company, entry);
  }
}

export function findDuplicateContact(contact, index) {
  const strongChecks = [
    ["email", normalizeEmail(contact.email), "email"],
    ["linkedin", normalizeLinkedIn(contact.linkedin), "LinkedIn"],
    ["phone", normalizePhone(contact.phone), "phone"],
  ];

  for (const [mapName, key, label] of strongChecks) {
    if (key && index[mapName].has(key)) {
      return { ...index[mapName].get(key), matchType: label, strength: "strong" };
    }
  }

  const company = normalizeCompany(contact.company?.name);
  const first = normalizeName(contact.firstName);
  const last = normalizeName(contact.lastName);
  if (first && last && company) {
    const key = first + "|" + last + "|" + company;
    if (index.personCompany.has(key)) {
      return { ...index.personCompany.get(key), matchType: "name + company", strength: "likely" };
    }
  }

  if (company && (contact.ownerType === "llc" || (!first && !last)) && index.company.has(company)) {
    return { ...index.company.get(company), matchType: "company", strength: "likely" };
  }

  return null;
}
