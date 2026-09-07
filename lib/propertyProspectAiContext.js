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
      clean(prospect?.mailingContactName) || clean(prospect?.ownerNameRaw),
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

function missingFieldsToResearch(prospect) {
  const fields = [];

  if (!clean(prospect?.mailingContactName)) fields.push("mailingContactName");
  if (!clean(prospect?.email)) fields.push("emailAddress");
  if (!clean(prospect?.phone)) fields.push("phoneNumber");
  if (!clean(prospect?.coOwnerName)) fields.push("coOwnerNameIfApplicable");

  return fields;
}

const CONFIDENCE_STANDARD = {
  confirmed:
    "Directly supported by a current primary or authoritative public source that clearly matches this owner or entity.",
  high:
    "Supported by multiple reliable matching signals with no meaningful conflict, but not directly confirmed by the person or entity.",
  medium:
    "Plausible and supported by some evidence, but identity, currentness, or attribution remains incomplete.",
  low: "A lead worth checking, not a proposed CRM value. The evidence is weak, indirect, inferred, or potentially stale.",
  notFound:
    "No credible value was found after reasonable research. Return null rather than guessing.",
};

const CONTACT_ENRICHMENT_INSTRUCTIONS = {
  objective:
    "Identify credible values for missing or uncertain contact fields while preserving the current CRM values and making no automatic changes.",
  fieldsToInvestigate: [
    "Public or professionally published email address.",
    "Public business, direct, or other relevant phone number.",
    "Correct mailing contact name, including the human decision-maker behind an LLC when supported.",
    "Co-owner name when applicable.",
    "Company or ownership-entity website.",
    "Relevant LinkedIn or other authoritative professional profile.",
    "Tax mailing, registered-office, business, and property addresses when needed to resolve identity or conflicting records.",
  ],
  requiredForEveryProposedValue: [
    "Field name and proposed value.",
    "Existing CRM value, including null when empty.",
    "Confidence: confirmed, high, medium, low, or notFound.",
    "A concise explanation of why the value belongs to this exact owner or entity.",
    "Direct source URL and source date or best available currentness indicator.",
    "Whether the value is safe to enter manually, should be verified first, or is only a research lead.",
  ],
  specialRules: [
    "Distinguish directly published or verified email addresses from pattern-inferred addresses. A pattern-inferred email cannot be confirmed or high confidence without direct evidence.",
    "Label phone numbers as business, direct, mobile, residential, or unknown when the evidence permits. Prefer public professional contact information.",
    "Do not treat a registered-office address, tax mailing address, business address, property address, and residential address as interchangeable.",
    "Do not overwrite a populated CRM field silently. Report conflicting values in a separate conflict section.",
    "Put low-confidence possibilities in leads to verify, not proposed record updates.",
    "Return null and notFound when no credible value is available. Never manufacture a value to complete the record.",
  ],
  confidenceStandard: CONFIDENCE_STANDARD,
};

const RESEARCH_INSTRUCTIONS = {
  objective:
    "Build a well-sourced understanding of the owner as a person, the business and property story around them, and the most credible succession path before discussing a letter.",
  draftGate:
    "Do not draft the letter until Nicholas explicitly says he is ready. Research and discussion must come first.",
  workflow: [
    "Resolve the owner's identity carefully using the supplied property and mailing information as clues. Do not merge people merely because their names match.",
    "Research the owner name(s), co-owner, LLC or entity names, business affiliations, professional history, company websites, LinkedIn, news, interviews, community involvement, and other relevant public sources.",
    "Look for a coherent ownership story: how the portfolio may have begun, how it changed, how professional experience may connect to ownership, and which facts are genuinely distinctive.",
    "Perform the dedicated successor investigation described below. Treat identifying a credible successor as a primary research goal, not a secondary family-history detail.",
    "Return a research briefing with source links and confidence notes. Clearly separate verified facts, reasonable inferences, unresolved identity questions, and details that should not be used in outreach.",
    "Discuss the findings with Nicholas. Recommend what belongs in CRM notes, what may shape the letter privately, and what could create an authentic point of connection.",
  ],
  requiredResearchAreas: [
    "Identity and name matching.",
    "Professional and career history.",
    "The owner's present role, level of involvement, decision-making responsibilities, and signs of changing involvement when publicly supported.",
    "Businesses, LLCs, and relevant public entity records.",
    "Property-ownership history and possible portfolio development.",
    "Company websites, LinkedIn, interviews, news, and reputable local mentions.",
    "Public community or civic involvement when relevant.",
    "Public evidence of family or business succession when relevant to ownership continuity.",
  ],
  personAndBusinessDeepDive: {
    objective:
      "Develop a useful, evidence-based picture of who this owner is, how they operate, what they appear to value, and how their business may function. Focus on information that helps Nicholas assess relationship fit, business continuity, and an authentic reason to connect.",
    investigate: [
      "Career chronology, education or training when professionally relevant, prior employers, professional credentials, and major career transitions.",
      "Current and former businesses, entity roles, partnerships, co-investments, acquisitions, dissolutions, assumed names, and connected property-management operations.",
      "How the owner appears to have entered property ownership, how the portfolio developed, and whether ownership is hands-on, professionally managed, family-run, partnership-based, or primarily passive.",
      "Public statements, interviews, articles, biographies, presentations, memberships, charitable work, civic involvement, and recurring themes that reveal professional interests or values.",
      "Publicly documented reputation signals, business milestones, leadership changes, disputes, litigation, liens, regulatory actions, or financial distress only when reliably sourced and materially relevant. Explain context and avoid sensational conclusions.",
      "Current business activity and continuity signals, including recent transactions, active websites, current licenses or registrations, staffing, public announcements, and evidence that operations are expanding, stable, contracting, delegated, or unclear.",
      "People who repeatedly appear alongside the owner in entities, transactions, management, professional work, or community activity, and what those connections may indicate about the owner's trusted network.",
      "Specific experiences, decisions, or expertise that could support a genuine conversation with Nicholas without making the owner feel surveilled.",
    ],
    assessmentQuestions: [
      "What is most distinctive and well-supported about this person's professional and ownership story?",
      "What appears to be the operating model of the business or portfolio?",
      "Who appears to influence decisions or handle day-to-day responsibilities?",
      "What evidence suggests the business is active, changing, transferring responsibility, or winding down?",
      "Does this person appear likely to value a conversation with Nicholas, and what is the strongest evidence for that assessment?",
      "Which useful findings belong only in private strategy and should never appear in outreach?",
    ],
    outputRules: [
      "Build a coherent narrative rather than returning a pile of search results.",
      "Attach source links to every material fact and label interpretations as inferences.",
      "Separate current facts from historical facts and note when a source may be stale.",
      "Do not include sensitive personal information that has no legitimate relevance to the business, properties, succession, identity resolution, or safe outreach.",
    ],
  },
  successorInvestigation: {
    purpose:
      "Determine whether there is a credible person or entity positioned to continue, inherit, manage, acquire, or otherwise assume responsibility for the owner's properties or business. Rank supported candidates and explain the likely succession path without converting family relationships into unsupported inheritance claims.",
    lookFor: [
      "A publicly named successor, transition plan, estate representative, trustee, or new controlling party.",
      "Children, relatives, or spouses publicly involved in the same property, LLC, company, investment activity, or professional work.",
      "Co-owners, longtime employees, property managers, registered agents, advisors, or business partners who may be operational successors even when they are not relatives.",
      "Shared ownership, family transfers, trust or estate transfers, changes in entity officers, changes in mailing information, or changes in management responsibility.",
      "Professional biographies, company team pages, Secretary of State or comparable entity records, assessor and recorder data, court or probate records where publicly accessible, obituaries, reputable news, and other sources that establish identity and relationship.",
      "Concrete evidence that a candidate already participates in ownership, operations, tenant relations, property management, acquisitions, finance, or decision-making.",
      "Evidence favoring a family transfer, internal business transition, third-party management, portfolio sale, or no visible transition path.",
    ],
    candidateReportFields: [
      "Rank and person or entity name.",
      "Candidate type: confirmed successor, probable successor, possible successor, potential professional successor, or no successor identified.",
      "Publicly documented relationship or business role.",
      "Evidence of relationship, reported separately from evidence of actual business or property involvement.",
      "Evidence for and against this candidate becoming the successor.",
      "Likely future role and likely succession path, clearly labeled as fact or inference.",
      "Confidence: confirmed, high, medium, or low, using the supplied confidence standard.",
      "Direct source links and dates or currentness indicators.",
      "What remains unknown and the single best respectful question that could clarify it.",
      "Whether the finding is appropriate for CRM notes, private strategy only, or not appropriate to retain or use.",
    ],
    requiredAssessment: [
      "State whether a credible successor was identified and name the strongest candidate when one exists.",
      "Rank all credible candidates rather than presenting an unstructured list of relatives and associates.",
      "Separate a documented family or professional connection from evidence that the person is actually involved in the business or properties.",
      "Assess whether succession makes this prospect more promising, less promising, or unchanged for relationship outreach, and explain why.",
      "Describe the most likely continuity path: family succession, business-associate succession, professional management, sale or consolidation, unclear, or no public evidence.",
      "Provide one respectful private follow-up question for Nicholas. Do not automatically place a succession question in the first letter.",
    ],
    restrictions: [
      "Do not identify anyone as legal next of kin unless a reliable public source explicitly establishes that status.",
      "Do not treat a shared surname, nearby address, or social-media connection as proof of a family relationship.",
      "Do not treat proof that someone is a child, spouse, relative, employee, registered agent, or property manager as proof that they will inherit or take control.",
      "Do not use age alone, portfolio age, an old mailing address, or reduced online visibility as evidence that a transition is imminent.",
      "Do not infer that there is no succession plan merely because no public evidence was found.",
      "Keep family and succession evidence out of the first letter unless Nicholas explicitly decides that a specific, publicly relevant detail is appropriate.",
      "If credible sources indicate that the owner is deceased, flag that clearly and pause any outreach recommendation until the correct recipient is resolved.",
    ],
  },
  boundaries: [
    "Focus on public professional, business, real-estate, community, career, and succession information that is relevant to understanding the owner.",

    "Use property and mailing information for identity resolution and portfolio context, not as permission to make invasive claims.",
    "Prefer primary sources and reputable reporting. Preserve source links for all material findings.",
    "Clearly label uncertainty and do not turn an inference into a fact.",
    "Research should help choose what not to say as much as what to say.",
  ],
  briefingRequirements: [
    "Begin with a concise conclusion covering identity confidence, owner and business assessment, property context, contactability, whether a credible successor exists, the strongest reason to pursue or deprioritize the prospect, the main uncertainty, and the recommended next step.",
    "Identity summary and confidence, including why the researched person matches this exact record.",
    "Proposed CRM field updates, conflicts, and lower-confidence leads to verify.",
    "Verified facts with source links.",
    "Reasonable inferences, clearly labeled.",
    "Unresolved identity questions or conflicting evidence.",
    "Professional, business, and property-ownership story.",
    "A dedicated successor assessment with ranked candidates, separate relationship and operational evidence, confidence, likely continuity path, alternative candidates, unknowns, and a respectful confirmation question.",
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
    goal: "Invite a story, judgment, lesson, value, or meaningful decision that this particular owner is well positioned to discuss.",
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
    use: "Share a brief, relevant truth about Nicholas considering what he wants to build next and wanting perspective from people with lived experience.",
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
    schemaVersion: 5,
    task: "Enrich missing or uncertain record fields, research this owner and their business deeply using current public sources, and make identifying a credible successor a primary goal. Begin with a concise conclusion, then provide sourced proposed updates, conflicts, leads to verify, the full research briefing, and a ranked successor assessment. Make no CRM changes and draft nothing until Nicholas explicitly approves the next step.",
    owner: {
      publicRecordName: clean(prospect?.ownerNameRaw),
      mailingContactName:
        clean(prospect?.mailingContactName) || clean(prospect?.ownerNameRaw),
      emailAddress: clean(prospect?.email) || null,
      phoneNumber: clean(prospect?.phone) || null,
      ownerType: clean(prospect?.ownerType) || null,
      coOwnerName: clean(prospect?.coOwnerName) || null,
      mailingAddress: mailingAddress(prospect),
    },
    recordEnrichment: {
      missingFieldsToResearch: missingFieldsToResearch(prospect),
      instructions: CONTACT_ENRICHMENT_INSTRUCTIONS,
      crmUpdatePolicy:
        "Research and recommend only. The copied response must not claim that the CRM was changed. Nicholas will review and enter any accepted values manually.",
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
