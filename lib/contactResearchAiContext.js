function clean(value) {
  return value == null ? "" : String(value).trim();
}

function nullable(value) {
  return clean(value) || null;
}

function summarizeAddress(address) {
  const street1 = nullable(address?.street1);
  const street2 = nullable(address?.street2);
  const city = nullable(address?.city);
  const state = nullable(address?.state);
  const zip = nullable(address?.zip);
  const country = nullable(address?.country);

  return {
    street1,
    street2,
    city,
    state,
    zip,
    country,
    formatted:
      [
        street1,
        street2,
        [city, state, zip].filter(Boolean).join(" "),
        country && country !== "US" ? country : "",
      ]
        .filter(Boolean)
        .join(", ") || null,
  };
}

function summarizeProperty(property) {
  if (!property) return null;

  const address = summarizeAddress({
    street1: property.street1,
    street2: property.street2,
    city: property.city || property.municipality,
    state: property.state,
    zip: property.zip,
    country: property.country,
  });

  return {
    address,
    municipality: nullable(property.municipality || property.city),
    county: nullable(property.county),
    parcelId: nullable(property.parcelId),
    units: property.numUnits ?? null,
    yearBuilt: property.yearBuilt ?? null,
    yearsOwned: property.ownershipYears ?? null,
    lastSaleDate: property.lastSaleDate || null,
    lastSaleValue: property.lastSaleValue ?? null,
    assessedValue: property.assessedValue ?? null,
    homestead: nullable(property.homestead),
    dwellingType: nullable(property.dwellingType),
    useClass: nullable(property.useClass),
  };
}

function missingContactFields(contact) {
  const fields = [];
  const isEntity = clean(contact?.ownerType).toLowerCase() === "llc";

  if (!isEntity && !clean(contact?.firstName)) fields.push("firstName");
  if (!isEntity && !clean(contact?.lastName)) fields.push("lastName");
  if (!clean(contact?.jobTitle)) fields.push("jobTitle");
  if (!clean(contact?.email)) fields.push("email");
  if (!clean(contact?.phone)) fields.push("phone");
  if (!clean(contact?.company?.name)) fields.push("company.name");
  if (!clean(contact?.company?.website)) fields.push("company.website");
  if (!clean(contact?.company?.industry)) fields.push("company.industry");
  if (!clean(contact?.website)) fields.push("website");
  if (!clean(contact?.linkedin)) fields.push("linkedin");
  if (!clean(contact?.facebook)) fields.push("facebook");

  const address = contact?.address || {};
  if (
    !clean(address.street1) ||
    !clean(address.city) ||
    !clean(address.state) ||
    !clean(address.zip)
  ) {
    fields.push("address");
  }

  return fields;
}

const CONFIDENCE_LEVELS = {
  confirmed:
    "An authoritative primary source directly connects the exact value to the resolved person or business.",
  high:
    "Multiple credible sources agree and the identity, location, company, or other supplied context matches strongly.",
  medium:
    "One credible source and meaningful contextual evidence support the value, but independent confirmation is missing.",
  low:
    "The value is only a plausible lead, is inferred, may be outdated, or has unresolved conflicting evidence. Do not treat it as ready for the CRM.",
  notFound:
    "No sufficiently credible public evidence was found. Return null instead of guessing.",
};

const RESEARCH_PROTOCOL = [
  "Use live web research. If browsing or deep-research tools are unavailable in this chat, say so instead of answering from memory.",
  "Resolve identity before attaching facts. Use the supplied name, location, company, property, address, role, and notes together; never merge people merely because their names match.",
  "Search name variants, business and entity names, known domains, addresses, phone numbers, property clues, and combinations of those identifiers.",
  "Prefer first-party and authoritative sources: official company sites, government registries, professional licensing records, county or property records, court and regulatory records, and direct interviews or biographies.",
  "Use reputable news, industry publications, professional profiles, local organizations, and review platforms as secondary evidence. Open and inspect the underlying sources rather than relying on search-result snippets.",
  "Cross-check material claims and all proposed CRM field values. For negative, legal, financial, or reputational findings, confirm the identity and report the date, context, and current disposition when available.",
  "Continue beyond the first plausible match. Search until the major claims are corroborated or the remaining uncertainty is clearly documented.",
  "If multiple plausible identities remain, keep them separate, explain the conflict, and ask Nicholas for clarification rather than choosing one.",
];

const CONTACT_ENRICHMENT_REQUIREMENTS = {
  goal:
    "Find credible candidates for missing CRM fields and evaluate existing contact details for conflicts or likely staleness. This research does not authorize changing the CRM.",
  targetFields: [
    "First and last name when the record represents a person.",
    "Current professional role or job title.",
    "Publicly listed professional or business email address.",
    "Publicly listed professional or business phone number.",
    "Mailing or business address, with the address type identified.",
    "Company name, official website, and industry.",
    "Personal or portfolio website.",
    "LinkedIn and other clearly attributable professional or public profiles.",
    "For an entity record, the publicly documented owners, principals, leaders, or likely decision-makers without converting them into the contact automatically.",
  ],
  rules: [
    "For every proposed field value, provide the field path, proposed value, confidence level, confidence explanation, source URLs, source dates when available, and whether the value appears current.",
    "For email addresses, state whether the address is publicly listed, independently verified by a verification service, inferred from a domain pattern, or unverified. A pattern-generated address can never be confirmed or high confidence without direct evidence.",
    "For phone numbers, identify the type when possible: business main line, professional direct line, mobile, residential, or unknown. Prefer business and professionally published numbers.",
    "For addresses, distinguish mailing, business, registered-office, property, and residential addresses. Do not present one type as another.",
    "Do not recommend overwriting a populated CRM field unless a stronger current source demonstrates that it is wrong or stale. Report conflicts separately.",
    "Put low-confidence possibilities in a leads-to-verify section, not in the proposed CRM updates table.",
    "When a field cannot be found, state not found and return null. Never invent a value to complete the record.",
  ],
  confidenceLevels: CONFIDENCE_LEVELS,
};

const DEEP_DIVE_AREAS = [
  "Identity, location, name variants, and evidence tying the research to the correct person.",
  "Career history, professional expertise, education when publicly documented, public work, interviews, and notable achievements.",
  "Current and former businesses, LLCs, ownership interests, leadership roles, partnerships, related entities, and decision-making authority.",
  "Business history, legal status, services, products, locations, markets, customers when public, leadership, staffing or hiring signals, and meaningful recent developments.",
  "Observable business-health signals such as expansion, contraction, new locations, closures, hiring, transactions, active projects, dated or active digital properties, and credible public reporting. Do not invent private revenue, profit, valuation, or employee counts.",
  "Public property ownership and real-estate activity when relevant to identity, wealth-building, business operations, or the reason this record exists.",
  "Professional associations, boards, community or civic involvement, public collaborations, and clearly documented business or family succession relevant to ownership continuity.",
  "Digital presence across websites, search, social profiles, content, video, technology, automation, and visible customer experience.",
  "Reputation signals from reputable reporting, public records, and meaningful review patterns. Do not elevate a single unsupported complaint into a conclusion.",
  "Material lawsuits, bankruptcies, liens, regulatory actions, licensing issues, or other public-record risks only when the identity match is strong and the information is relevant and presented neutrally.",
  "Recent trigger events that could make outreach timely, along with facts suggesting whether this is a promising client, collaborator, referral relationship, mentor, property contact, or other professional connection.",
];

const ASSESSMENT_CONTEXT = {
  user: "Nicholas Egner in Minneapolis, Minnesota",
  capabilities: [
    "Web development and digital strategy.",
    "Technology, automation, systems, and workflow improvement.",
    "Video, media, content production, and digital presentation.",
    "Practical support for small businesses and local professional relationships.",
  ],
  purpose:
    "Assess the person and their business as a possible professional relationship, prospective client, collaborator, referral connection, property contact, or source of useful lived experience. Let the supplied CRM project, relationship type, notes, and service interests determine which possibilities deserve emphasis.",
};

const EVIDENCE_RULES = [
  "Cite a direct source URL next to every material factual claim. End with a deduplicated source list containing title, publisher, URL, publication date when available, and what the source supports.",
  "Separate verified facts, credible but unconfirmed information, reasonable inference, and unknown information. Never rewrite an inference as fact.",
  "Explain why each source appears to belong to this exact person or business, especially for common names.",
  "Treat directory listings, scraped profiles, automated people-search pages, and AI-generated summaries as leads rather than authoritative proof unless independently corroborated.",
  "State when a source is old and when current status could not be established. Absence of public evidence is not evidence that something does not exist.",
  "Do not infer protected or highly sensitive personal traits. Exclude private, invasive, or irrelevant personal information even if it appears online.",
  "Family information belongs only when publicly documented and directly relevant to business ownership, property ownership, or succession. Do not infer relationships from surnames, addresses, or social connections alone.",
];

const OUTPUT_REQUIREMENTS = {
  format: "A structured, readable Markdown research briefing for Nicholas.",
  order: [
    "Short conclusion: identify who this appears to be, identity confidence, overall business assessment, contactability, the strongest reason to pursue or deprioritize the relationship, the main uncertainty or concern, and the recommended next step. Keep this concise and evidence-based; do not assign an opaque numerical prospect score.",
    "Proposed CRM field updates: a table containing only confirmed, high-confidence, and clearly labeled medium-confidence candidates. Include field, current value, proposed value, confidence, why, source links, source date, and current/stale assessment.",
    "Existing-field conflicts: anything that appears wrong, outdated, or associated with another person. Do not silently replace it.",
    "Leads to verify: low-confidence contact details or possible matches that should not yet be entered into the CRM.",
    "Identity resolution: evidence for the selected identity, other candidates considered, and unresolved conflicts.",
    "Person profile: career, expertise, public work, associations, and professionally relevant background.",
    "Business assessment: ownership, related entities, operations, apparent health and activity, reputation, recent developments, and decision-making role.",
    "Property and public-record findings when relevant.",
    "Relationship and opportunity assessment: evidence-backed fit, two or three authentic connection angles, possible ways Nicholas could be useful, and anything that would feel intrusive or inappropriate to mention.",
    "Unknowns and recommended manual verification steps.",
    "Sources.",
  ],
  finalInstruction:
    "Complete the research briefing only. Do not draft a letter, email, message, or CRM entry unless Nicholas asks in a later turn.",
};

export function buildContactResearchAiContext(contact) {
  const personName = [clean(contact?.firstName), clean(contact?.lastName)]
    .filter(Boolean)
    .join(" ");
  const properties = (contact?.properties || [])
    .map(summarizeProperty)
    .filter(Boolean);

  return {
    contextType: "crm_contact_deep_research_and_enrichment",
    schemaVersion: 1,
    preparedAt: new Date().toISOString(),
    task:
      "Use current public sources to conduct a genuine deep investigation of this CRM contact and their business. Identify credible missing-field candidates with field-level confidence and sources, then provide a concise overall assessment. Research only; do not modify the CRM or draft outreach.",
    workflowNotice:
      "Nicholas copied this JSON from the CRM and pasted it into this chat. Nothing you return is automatically saved. Treat all field values as proposed research findings for Nicholas to review manually.",
    contactRecord: {
      person: {
        firstName: nullable(contact?.firstName),
        lastName: nullable(contact?.lastName),
        displayName:
          nullable(contact?.ownerNameRaw) ||
          nullable(personName) ||
          nullable(contact?.company?.name),
        publicRecordOrEntityName: nullable(contact?.ownerNameRaw),
        ownerType: nullable(contact?.ownerType),
        coOwnerName: nullable(contact?.coOwnerName),
        jobTitle: nullable(contact?.jobTitle),
        knownBirthday: nullable(contact?.birthday),
      },
      contactDetails: {
        email: nullable(contact?.email),
        phone: nullable(contact?.phone),
        mailingAddress: summarizeAddress(contact?.address),
      },
      company: {
        name: nullable(contact?.company?.name),
        website: nullable(contact?.company?.website),
        industry: nullable(contact?.company?.industry),
      },
      onlineProfiles: {
        personalOrPortfolioWebsite: nullable(contact?.website),
        linkedin: nullable(contact?.linkedin),
        facebook: nullable(contact?.facebook),
      },
      crmContext: {
        project: nullable(contact?.project),
        relationshipType: nullable(contact?.relationshipType),
        rank: nullable(contact?.rank),
        serviceInterest: Array.isArray(contact?.serviceInterest)
          ? contact.serviceInterest.map(clean).filter(Boolean)
          : [],
        notes: nullable(contact?.notes),
      },
      outreachContext: {
        emailStatus: nullable(contact?.emailStatus),
        introductionEmailStatus:
          nullable(contact?.introEmail?.status) ||
          (contact?.introEmail?.sent ? "sent" : null),
        lastContact: {
          date: contact?.lastContact?.date || null,
          type: nullable(contact?.lastContact?.type),
          notes: nullable(contact?.lastContact?.notes),
        },
        nextFollowUp: contact?.nextFollowUp || null,
      },
      propertyContext: {
        primaryProperty: summarizeProperty(contact?.property),
        knownProperties: properties,
        propertySearchCity: nullable(contact?.propertySearchCity),
        propertiesInSearchCity: contact?.propertyCityCount ?? null,
        confirmedMetroProperties:
          contact?.propertyMetroConfirmedCount ?? null,
        sourceMailingAddress: contact?.propertyMailingAddressRaw || null,
      },
    },
    missingFieldsToResearch: missingContactFields(contact),
    assessmentContext: ASSESSMENT_CONTEXT,
    researchProtocol: RESEARCH_PROTOCOL,
    contactEnrichmentRequirements: CONTACT_ENRICHMENT_REQUIREMENTS,
    deepDiveResearchAreas: DEEP_DIVE_AREAS,
    evidenceRules: EVIDENCE_RULES,
    outputRequirements: OUTPUT_REQUIREMENTS,
  };
}

export function contactResearchAiContextJson(contact) {
  return JSON.stringify(buildContactResearchAiContext(contact), null, 2);
}

export async function copyContactResearchAiContext(contact) {
  const text = contactResearchAiContextJson(contact);

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return text;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard access is not available.");
  }

  return text;
}
