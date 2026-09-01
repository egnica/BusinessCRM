function clean(value) {
  return value == null ? "" : String(value).trim();
}

function propertyAddress(property) {
  if (!property) return "";

  return [
    clean(property.street1),
    clean(property.street2),
    [
      clean(property.city || property.municipality),
      clean(property.state),
      clean(property.zip),
    ]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}

function summarizeProperty(property) {
  if (!property) return null;

  return {
    address: propertyAddress(property),
    municipality: clean(property.municipality || property.city),
    county: clean(property.county),
    units: property.numUnits ?? null,
    yearBuilt: property.yearBuilt ?? null,
    yearsOwned: property.ownershipYears ?? null,
    lastSaleDate: property.lastSaleDate || null,
    lastSaleValue: property.lastSaleValue ?? null,
    assessedValue: property.assessedValue ?? null,
    homestead: clean(property.homestead) || null,
    dwellingType: clean(property.dwellingType) || null,
    useClass: clean(property.useClass) || null,
  };
}

function mailingAddress(prospect) {
  const lines = (prospect?.mailingAddress?.lines || [])
    .map(clean)
    .filter(Boolean);

  return {
    recipientName:
      clean(prospect?.mailingContactName) ||
      clean(prospect?.ownerNameRaw),
    lines,
    formatted: lines.join(", "),
  };
}

function metroSummary(prospect) {
  const metroLookup = prospect?.metroLookup || null;

  return {
    searchCity: clean(
      prospect?.searchCity ||
        prospect?.primaryProperty?.municipality ||
        prospect?.primaryProperty?.city,
    ),
    propertiesInSearchCity:
      prospect?.cityPropertyCount ??
      prospect?.propertyCount ??
      prospect?.properties?.length ??
      0,
    confirmedMetroProperties:
      metroLookup?.confirmedPropertyCount ??
      prospect?.metroPropertyCount ??
      null,
    possibleMetroMatches: metroLookup?.possibleMatchCount ?? null,
    cityBreakdown:
      metroLookup?.confirmedCityBreakdown ||
      prospect?.metroCityBreakdown ||
      prospect?.cityBreakdown ||
      [],
    longestHeldYears: prospect?.longestHeldYears ?? null,
    mostRecentPurchaseYears: prospect?.mostRecentPurchaseYears ?? null,
  };
}

export function buildPropertyProspectAiContext(prospect) {
  const properties = (prospect?.properties || [])
    .map(summarizeProperty)
    .filter(Boolean);

  const additionalConfirmed =
    prospect?.metroLookup?.additionalConfirmedProperties || [];

  return {
    contextType: "property_owner_relationship_outreach",
    task:
      "Do not draft the letter immediately. First research the owner(s) and any clearly related business or entity using current public web sources, then discuss the findings with me. After we decide what is useful and appropriate, help draft a short, personal physical letter. The first goal is to start a genuine conversation, not to make an acquisition pitch.",
    workflow: {
      step1:
        "Do a deep but respectful web research pass before writing. Search the owner name(s), any LLC/entity name, likely business affiliations, professional history, company websites, LinkedIn, news, interviews, local business mentions, and other relevant public sources.",
      step2:
        "Summarize what you found with source links. Separate verified facts from reasonable inferences and clearly flag identity uncertainty, especially when names are common.",
      step3:
        "Discuss the findings with me before drafting. Suggest which details might create a genuine connection, which should only inform tone/background, and which would feel intrusive or inappropriate to mention.",
      step4:
        "Do not produce the final letter until I explicitly say I am ready to draft it.",
      researchBoundaries: [
        "Focus on public professional, business, real-estate, community, and career information that is relevant to understanding the owner.",
        "Do not hunt for or surface sensitive personal information such as health, religion, political affiliation, family/private-life details, financial account information, or other data that would be inappropriate for outreach.",
        "Do not assume two people with the same or similar name are the same person.",
        "Use the property and mailing information as identity clues, not as permission to make invasive claims.",
        "Prefer high-quality primary or reputable sources when available.",
      ],
    },
    owner: {
      publicRecordName: clean(prospect?.ownerNameRaw),
      mailingContactName:
        clean(prospect?.mailingContactName) ||
        clean(prospect?.ownerNameRaw),
      ownerType: clean(prospect?.ownerType) || null,
      coOwnerName: clean(prospect?.coOwnerName) || null,
      mailingAddress: mailingAddress(prospect),
    },
    primaryProperty: summarizeProperty(prospect?.primaryProperty),
    knownProperties: properties,
    portfolioResearch: {
      ...metroSummary(prospect),
      additionalConfirmedProperties: additionalConfirmed
        .map(summarizeProperty)
        .filter(Boolean),
    },
    myResearchNotes: clean(prospect?.notes),
    researchPrompt:
      "Please research this owner or ownership entity before we write anything. I want to understand who they are, what business or professional background they may have, how their property ownership may fit into their story, and whether there are authentic points of connection. Bring me the findings first, with links and confidence notes. Then talk through what is worth adding to my CRM notes and what might help shape the outreach. Do not draft the letter until I tell you to.",
    outreachStrategy: {
      primaryGoal:
        "Start a genuine relationship with an experienced local property owner and learn from their experience.",
      conversationGoals: [
        "Learn how they bought their first property.",
        "Learn how they expanded beyond the first property.",
        "Understand what they learned from owning and managing property.",
        "Ask whether they would be open to a short conversation, coffee, or sharing advice.",
      ],
      valueICanOffer: [
        "Websites and digital presence.",
        "Technology and automation.",
        "Digital systems and workflow help.",
        "Video, media, and content.",
        "Practical hands-on help where useful.",
      ],
      longTermPossibilitiesForContextOnly: [
        "Mentorship.",
        "Paid work or helping with their business.",
        "Sweat-equity opportunities.",
        "Partnership.",
        "Eventual property purchase.",
        "Seller financing or another mutually workable path into ownership.",
      ],
      important:
        "The long-term possibilities above are background context for the AI. They should not normally be direct asks in the first letter.",
      tone: [
        "curious",
        "personal",
        "respectful",
        "grounded",
        "human",
        "non-salesy",
      ],
      avoid: [
        "Cash-buyer or wholesaler language.",
        "Aggressive investor language.",
        "Fake urgency.",
        "Directly asking for a job, financing, equity, or mentorship in the first letter.",
        "Making the owner feel researched or surveilled.",
        "Reciting exact assessed values, sale prices, parcel IDs, or other public-record details unless there is a compelling reason.",
        "Pretending the only goal is to buy their property.",
        "Claims that are not supported by the provided research.",
      ],
      publicRecordGuidance:
        "Use property data primarily as background intelligence. High-level observations such as 'it looks like you have been involved with local property for quite a while' can be appropriate. Avoid overly specific public-record facts that would feel intrusive.",
      firstLetterAsk:
        "A low-pressure invitation to talk, have coffee, or share how they got started.",
    },
    outputPreference: {
      format: "physical letter",
      length: "short",
      style:
        "Sound like one real local person writing to another, not a marketing campaign or mass investor mailer.",
    },
  };
}

export function propertyProspectAiContextJson(prospect) {
  return JSON.stringify(buildPropertyProspectAiContext(prospect), null, 2);
}


export async function copyPropertyProspectAiContext(prospect) {
  const text = propertyProspectAiContextJson(prospect);

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
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
