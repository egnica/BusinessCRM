import test from "node:test";
import assert from "node:assert/strict";
import {
  addContactToDuplicateIndex,
  buildImportUpdateSet,
  createDuplicateIndex,
  findDuplicateContact,
  guessImportField,
  mapCsvRows,
  normalizeImportRow,
  parseCsvText,
} from "../lib/contactImport.mjs";

test("CSV parser handles quoted commas, escaped quotes, and embedded newlines", () => {
  const parsed = parseCsvText('Name,Company,Notes\n"Jane Doe","Doe, LLC","Said ""hello""\nSecond line"\n');
  assert.deepEqual(parsed.headers, ["Name", "Company", "Notes"]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0][1], "Doe, LLC");
  assert.equal(parsed.rows[0][2], 'Said "hello"\nSecond line');
});

test("common CSV headers map to CRM fields", () => {
  assert.equal(guessImportField("Email Address"), "email");
  assert.equal(guessImportField("Organization"), "companyName");
  assert.equal(guessImportField("LinkedIn URL"), "linkedin");
  const rows = mapCsvRows(
    ["Contact", "Organization", "Email Address"],
    [["Jane Doe", "Doe Studio", "jane@example.com"]],
    ["fullName", "companyName", "email"],
  );
  assert.deepEqual(rows[0], {
    fullName: "Jane Doe",
    companyName: "Doe Studio",
    email: "jane@example.com",
  });
});

test("company-only rows become valid entity contacts and imported email status stays unknown", () => {
  const normalized = normalizeImportRow(
    { companyName: "Acme LLC", email: "hello@acme.com" },
    { now: "2026-10-05T15:00:00.000Z", batchId: "batch", fileName: "contacts.csv" },
  );
  assert.deepEqual(normalized.errors, []);
  assert.equal(normalized.contact.ownerType, "llc");
  assert.equal(normalized.contact.company.name, "Acme LLC");
  assert.equal(normalized.contact.emailStatus, "unknown");
  assert.equal(normalized.contact.importSource, "csv");
  assert.equal(normalized.contact.rank, "D");
});

test("explicit import rank is preserved and duplicate updates do not invent D rank", () => {
  const ranked = normalizeImportRow({ firstName: "Jane", lastName: "Doe", rank: "B" });
  assert.equal(ranked.contact.rank, "B");

  const defaulted = normalizeImportRow({ firstName: "Jane", lastName: "Doe" });
  const update = buildImportUpdateSet(
    { firstName: "Jane", lastName: "Doe" },
    defaulted.contact,
    { now: "2026-10-05T15:00:00.000Z" },
  );
  assert.equal("rank" in update, false);

  const explicitUpdate = buildImportUpdateSet(
    { firstName: "Jane", lastName: "Doe", rank: "C" },
    normalizeImportRow({ firstName: "Jane", lastName: "Doe", rank: "C" }).contact,
    { now: "2026-10-05T15:00:00.000Z" },
  );
  assert.equal(explicitUpdate.rank, "C");
});

test("invalid rows require either a complete person name or a company", () => {
  const missing = normalizeImportRow({ firstName: "Only" });
  assert.equal(missing.errors.length, 1);
  const invalidEmail = normalizeImportRow({
    firstName: "Jane",
    lastName: "Doe",
    email: "not-an-email",
  });
  assert.match(invalidEmail.errors.join(" "), /Email address/);
});

test("duplicate matching normalizes email, phone, LinkedIn, and LLC names", () => {
  const existing = [{
    _id: "507f1f77bcf86cd799439011",
    firstName: "Jane",
    lastName: "Doe",
    ownerType: "individual",
    email: "Jane@Example.com",
    phone: "(612) 555-1212",
    linkedin: "https://www.linkedin.com/in/jane-doe/",
    company: { name: "Doe Studio LLC" },
  }];
  const index = createDuplicateIndex(existing);

  let duplicate = findDuplicateContact(
    normalizeImportRow({ firstName: "J", lastName: "D", email: "jane@example.com" }).contact,
    index,
  );
  assert.equal(duplicate.matchType, "email");

  duplicate = findDuplicateContact(
    normalizeImportRow({ firstName: "J", lastName: "D", phone: "612-555-1212" }).contact,
    index,
  );
  assert.equal(duplicate.matchType, "phone");

  addContactToDuplicateIndex(index, {
    ownerType: "llc",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    linkedin: "",
    company: { name: "Acme, LLC" },
  }, { source: "file", rowIndex: 0, id: "file:0" });

  duplicate = findDuplicateContact(
    normalizeImportRow({ companyName: "Acme LLC" }).contact,
    index,
  );
  assert.equal(duplicate.matchType, "company");
  assert.equal(duplicate.source, "file");
});
