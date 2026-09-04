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

const RESEARCH_INSTRUCTIONS = {
  objective:
    "Build a well-sourced understanding of the owner, any co-owner, and any clearly related business or ownership entity before discussing a letter.",
  draftGate:
    "Do not draft the letter until Nicholas explicitly says he is ready. Research and discussion must come first.",
  workflow: [
    "Resolve the owner's identity carefully using the supplied property and mailing information as clues. Do not merge people merely because their names match.",
    "Research the owner name(s), co-owner, LLC or entity names, business affiliations, professional history, company websites, LinkedIn, news, interviews, community involvement, and other relevant public sources.",
    "Look for a coherent ownership story: how the portfolio may have begun, how it changed, how professional experience may connect to ownership, and which facts are genuinely distinctive.",
    "Perform the limited succession and family-continuity research described below.",
    "Return a research briefing with source links and confidence notes. Clearly separate verified facts, reasonable inferences, unresolved identity questions, and details that should not be used in outreach.",
    "Discuss the findings with Nicholas. Recommend what belongs in CRM notes, what may shape the letter privately, and what could create an authentic point of connection.",
  ],
  requiredResearchAreas: [
    "Identity and name matching.",
    "Professional and career history.",
    "Businesses, LLCs, and relevant public entity records.",
    "Property-ownership history and possible portfolio development.",
    "Company websites, LinkedIn, interviews, news, and reputable local mentions.",
    "Public community or civic involvement when relevant.",
    "Limited public evidence of adult family or business succession when relevant to ownership continuity.",
  ],
  successionAndFamilyEvidence: {
    purpose:
      "Look for credible public evidence of adult relatives, co-owners, business colleagues, or named successors who may be relevant to the future continuity of the owner's properties or business. This is succession context, not permission to investigate private family life.",
    lookFor: [
      "Adult relatives publicly involved in the same property, LLC, company, or professional work.",
      "Shared ownership, family property transfers, public business roles, or an announced succession plan.",
      "Reliable professional biographies, company team pages, public entity records, property records, reputable news, or obituaries that establish a relationship.",
      "Evidence that a likely successor is already participating in operations or ownership.",
    ],
    reportFields: [
      "Person or entity name.",
      "Publicly documented relationship or role.",
      "The evidence supporting the connection.",
      "Source link.",
      "Confidence: verified, probable, uncertain, or no credible evidence found.",
      "Possible relevance to business or property continuity.",
      "Whether it is appropriate for CRM notes, private strategy only, or not appropriate to retain or use.",
    ],
    restrictions: [
      "Do not identify anyone as legal next of kin unless a reliable public source explicitly establishes that status.",
      "Do not treat a shared surname, nearby address, or social-media connection as proof of a family relationship.",
      "Do not research or report minors.",
      "Do not surface private phone numbers, private email addresses, home addresses, health information, relationship conflict, or unrelated personal details.",
      "Do not infer that there is no succession plan merely because no public evidence was found.",
      "Keep family and succession evidence out of the first letter unless Nicholas explicitly decides that a specific, publicly relevant detail is appropriate.",
      "If credible sources indicate that the owner is deceased, flag that clearly and pause any outreach recommendation until the correct recipient is resolved.",
    ],
  },
  boundaries: [
    "Focus on public professional, business, real-estate, community, career, and limited succession information that is relevant to understanding the owner.",
    "Do not broadly investigate health, religion, political affiliation, finances, private relationships, or unrelated family life.",
    "Use property and mailing information for identity resolution and portfolio context, not as permission to make invasive claims.",
    "Prefer primary sources and reputable reporting. Preserve source links for all material findings.",
    "Clearly label uncertainty and do not turn an inference into a fact.",
    "Research should help choose what not to say as much as what to say.",
  ],
  briefingRequirements: [
    "Identity summary and confidence.",
    "Verified facts with source links.",
    "Reasonable inferences, clearly labeled.",
    "Unresolved identity questions or conflicting evidence.",
    "Professional, business, and property-ownership story.",
    "Succession and adult family-continuity evidence, including when no credible evidence was found.",
    "Two or three authentic connection angles for discussion, not a drafted letter.",
    "Two or three possible experience-rich questions tailored to this owner, with a recommendation for the strongest one.",
    "Details that would feel intrusive, overly researched, irrelevant, or unsafe to mention.",
    "Concise recommendations for CRM notes.",
  ],
};

const OUTREACH_STRATEGY = {
  primaryGoal:
    "Start a genuine relationship with an experienced local property owner and learn from their lived experience.",
  firstLetterObjective:
    "Earn the next human exchange. The first letter is not meant to persuade the owner to sell, secure mentorship, solve Nicholas's career uncertainty, or force a meeting.",
  senderContext: {
    name: "Nicholas Egner",
    location: "Minneapolis, Minnesota",
    establishedBackground: [
      "Web development and digital strategy.",
      "Technology and automation.",
      "Video, media, and content production.",
      "Helping small businesses improve systems and workflows.",
    ],
    currentDirection:
      "Nicholas is in a mid-career period of thinking seriously about what he wants to build next. He is increasingly interested in small-scale property ownership and the businesses around it because the work is tangible, local, and rewards patience and judgment.",
    honestLimitation:
      "He knows there is only so much he can learn from public records, spreadsheets, and online advice without listening to people who have actually made the decisions.",
  },
  firstLetterMethod: [
    "Make the recipient feel that the letter was genuinely intended for them, without displaying the full depth of the research.",
    "Bring the recipient and the distinctive reason they stood out into the letter early.",
    "Establish warm, honest intent before describing Nicholas's credentials.",
    "Use no more than one safe, relevant researched detail unless a second detail is essential for clarity.",
    "Use one concise statement of bounded vulnerability to explain why Nicholas is reaching out now. It should provide context, not create a rescue obligation.",
    "Ask exactly one main experience-rich question tailored to this owner.",
    "Close with one invitation to share their perspective through a short phone call, coffee, or email.",
  ],
  questionGuidance: {
    goal:
      "Invite a story, judgment, lesson, value, or meaningful decision that this particular owner is well positioned to discuss.",
    requirements: [
      "Ask exactly one main question in the first letter.",
      "Connect the question to a verified, distinctive part of the owner's professional or ownership background when possible.",
      "Make the question easy to understand and answer. A natural contrast, such as whether an accounting background created confidence or caution, can help open a story.",
      "Prefer lived experience over facts that can already be found in public records.",
    ],
    avoid: [
      "Bundling how they started, what worked, what failed, and what they learned into one interview-like paragraph.",
      "Generic questions that could be mailed unchanged to every property owner.",
      "Questions about selling, retirement, inheritance, children, succession, or private family plans in the first letter.",
    ],
  },
  vulnerabilityGuidance: {
    use:
      "Share a brief, relevant truth about Nicholas considering what he wants to build next and wanting perspective from people with lived experience.",
    limit:
      "Usually one sentence is enough. Vulnerability should explain the outreach, not ask the recipient to fix Nicholas's life.",
    doNotUse: [
      "Financial pressure, job rejections, desperation, or rescue language.",
      "Claims that software development is obsolete or that AI is eliminating Nicholas's career.",
      "An employment, partnership, equity, financing, or ongoing mentorship request.",
      "Forced self-deprecating humor or an exaggerated confession.",
    ],
  },
  responseOptions: {
    preferredOrder: ["short phone call", "coffee", "email"],
    guidance:
      "Offer a short phone call, coffee, or email naturally and in that order. Treat them as equally valid ways to share perspective; do not make one mandatory or require an immediate commitment.",
  },
  researchVisibility:
    "The letter should reveal far less than the research briefing. Use research to select one meaningful connection and shape the tone, not to prove how much was discovered.",
  publicRecordGuidance:
    "Use property data primarily as background intelligence. A restrained high-level observation can be appropriate, but avoid exact assessed values, sale prices, parcel IDs, ownership counts, addresses, and dates unless there is a compelling and explicitly discussed reason.",
  privateStrategicContext: {
    valueNicholasCanOfferLater: [
      "Websites and digital presence.",
      "Technology and automation.",
      "Digital systems and workflow help.",
      "Video, media, and content.",
      "Practical hands-on help where useful.",
    ],
    possibleLongTermOutcomes: [
      "Mentorship.",
      "Paid work or helping with their business.",
      "Sweat-equity opportunities.",
      "Partnership.",
      "Eventual property purchase.",
      "Seller financing or another mutually workable path into ownership.",
    ],
    guardrail:
      "These possibilities explain why a genuine relationship could matter over time. They are private context only and should not be presented as first-letter asks.",
  },
  tone: [
    "curious",
    "warm",
    "personal",
    "respectful",
    "grounded",
    "human",
    "non-salesy",
  ],
  avoid: [
    "Cash-buyer, wholesaler, or aggressive investor language.",
    "A defensive paragraph explaining everything Nicholas is not.",
    "Fake urgency or pressure.",
    "The phrase 'no pressure at all.'",
    "The phrase 'pick your brain.'",
    "Repeated generic phrases such as 'over time' or 'built something over time.'",
    "Multiple questions or an interview-style list.",
    "Making the owner feel researched, surveilled, flattered, or manipulated.",
    "Mentioning family, next-of-kin, or succession research without explicit discussion and approval.",
    "Claims that are not supported by verified research.",
    "Making the first letter primarily about Nicholas instead of the recipient.",
  ],
};

const OUTPUT_PREFERENCE = {
  format: "physical letter body HTML for the CRM Letter HTML editor",
  length: {
    targetWords: "140 to 210 words",
    guidance:
      "Keep the first letter to one page with generous paragraph breaks. A small variation is acceptable when the owner's context genuinely requires it.",
  },
  finalDraftRequirements: [
    "Return only the letter body HTML when Nicholas explicitly requests the final draft.",
    "Include exactly one main experience-rich question.",
    "Offer a short phone call, coffee, or email as the response options.",
    "Do not include research commentary, confidence notes, citations, or drafting explanations in the final letter HTML.",
  ],
  htmlRequirements: [
    "Use clean semantic HTML such as <p>, <strong>, <em>, and <br> where appropriate.",
    "Do not include <html>, <head>, <body>, CSS, JavaScript, markdown code fences, or explanatory text around the final HTML.",
    "Paragraphs should use <p> tags and should wrap naturally. Use <br> only for intentional line breaks such as a sign-off.",
    "Encode typographic punctuation and other non-ASCII punctuation as numeric HTML entities in the final HTML so Lob does not misread character encoding.",
    "Do not output raw curly apostrophes, curly quotation marks, em dashes, en dashes, or ellipses in the final HTML. Use entities instead: &#8217; for ’, &#8216; for ‘, &#8220; for “, &#8221; for ”, &#8212; for —, &#8211; for –, and &#8230; for ….",
    "For example, write I&#8217;m, you&#8217;ve, I&#8217;d, and didn&#8217;t rather than using raw curly apostrophes.",
    "The CRM adds the Lob page wrapper and typography automatically.",
  ],
  characterLimit: {
    lobFinalHtmlMaximum: 10000,
    requestedBodyHtmlMaximum: 9000,
    guidance:
      "Lob's inline HTML input must remain under 10,000 characters after the CRM adds its wrapper. Keep the returned body HTML under 9,000 characters to leave safe room for that wrapper. In practice, this outreach letter should be far shorter than the limit.",
  },
  style:
    "Sound like one real local person writing to another, not a marketing campaign, mass investor mailer, or AI-generated profile summary.",
};

export function buildPropertyProspectAiContext(prospect) {
  const properties = (prospect?.properties || [])
    .map(summarizeProperty)
    .filter(Boolean);

  const additionalConfirmed =
    prospect?.metroLookup?.additionalConfirmedProperties || [];

  return {
    contextType: "property_owner_relationship_outreach",
    schemaVersion: 4,
    task:
      "Research this owner deeply but respectfully using current public sources. Bring Nicholas a sourced research briefing and discuss the outreach strategy before drafting anything. Draft only after explicit approval.",
    owner: {
      publicRecordName: clean(prospect?.ownerNameRaw),
      mailingContactName:
        clean(prospect?.mailingContactName) ||
        clean(prospect?.ownerNameRaw),
      emailAddress: clean(prospect?.email) || null,
      phoneNumber: clean(prospect?.phone) || null,
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
    researchInstructions: RESEARCH_INSTRUCTIONS,
    outreachStrategy: OUTREACH_STRATEGY,
    outputPreference: OUTPUT_PREFERENCE,
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
