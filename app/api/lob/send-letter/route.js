import { createHash } from "crypto";
import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { getMailingContactName } from "@/lib/propertyOwnerSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOB_API_BASE = "https://api.lob.com/v1";

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeAddress(address = {}) {
  return {
    name: clean(address.name),
    address_line1: clean(address.address_line1),
    address_line2: clean(address.address_line2) || undefined,
    address_city: clean(address.address_city),
    address_state: clean(address.address_state).toUpperCase(),
    address_zip: clean(address.address_zip),
    address_country: clean(address.address_country) || "US",
  };
}

function validateAddress(address, label) {
  const required = [
    "name",
    "address_line1",
    "address_city",
    "address_state",
    "address_zip",
  ];

  const missing = required.filter((field) => !address[field]);

  if (missing.length) {
    throw new Error(label + " address is missing: " + missing.join(", "));
  }
}

function buildLetterHtml(bodyHtml) {
  return [
    '<html style="padding-top: 3in; margin: .5in;">',
    '<div style="font-family: Georgia, Times New Roman, serif; font-size: 11pt; line-height: 1.45; overflow-wrap: break-word;">',
    bodyHtml,
    "</div>",
    "</html>",
  ].join("");
}

function createProofHash({ prospectId, to, from, bodyHtml }) {
  const payload = JSON.stringify({
    prospectId: clean(prospectId),
    to,
    from,
    bodyHtml: clean(bodyHtml),
  });

  return createHash("sha256").update(payload).digest("hex");
}

function authHeader(apiKey) {
  return "Basic " + Buffer.from(apiKey + ":").toString("base64");
}

async function lobFetch(path, apiKey, options = {}) {
  return fetch(LOB_API_BASE + path, {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: authHeader(apiKey),
      ...(options.headers || {}),
    },
  });
}

async function readLobResponse(response, fallbackMessage) {
  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.status_code ||
      data?.message ||
      fallbackMessage ||
      "Lob request failed.";

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

function serializeProspect(prospect) {
  return {
    ...prospect,
    mailingContactName: getMailingContactName(prospect),
    _id: prospect._id?.toString?.() || prospect._id,
    crmContactId:
      prospect.crmContactId?.toString?.() || prospect.crmContactId || "",
  };
}

function serializeLetter(letter) {
  if (!letter) return null;

  return {
    ...letter,
    _id: letter._id?.toString?.() || letter._id || "",
    prospectId:
      letter.prospectId?.toString?.() || letter.prospectId || "",
  };
}

async function ensureLetterHistoryIndex(collection) {
  await collection.createIndex(
    { proofLetterId: 1 },
    { unique: true, sparse: true, name: "lob_proof_letter_unique" },
  );
}

export async function POST(request) {
  try {
    const liveApiKey = clean(process.env.LOB_LIVE_API_KEY);
    const testApiKey = clean(process.env.LOB_TEST_API_KEY);

    if (!liveApiKey) {
      return Response.json(
        { error: "LOB_LIVE_API_KEY is not configured." },
        { status: 500 },
      );
    }

    if (!liveApiKey.startsWith("live_") || liveApiKey.startsWith("live_pub_")) {
      return Response.json(
        {
          error:
            "LOB_LIVE_API_KEY must be a Lob Live Secret API Key.",
        },
        { status: 500 },
      );
    }

    if (!testApiKey || !testApiKey.startsWith("test_") || testApiKey.startsWith("test_pub_")) {
      return Response.json(
        {
          error:
            "LOB_TEST_API_KEY must remain configured so the live send can verify its proof.",
        },
        { status: 500 },
      );
    }

    const body = await request.json();
    const prospectId = clean(body.prospectId);
    const proofLetterId = clean(body.proofLetterId);
    const submittedBodyHtml = clean(body.bodyHtml);
    const to = normalizeAddress(body.to);
    const from = normalizeAddress(body.from);

    if (prospectId && !ObjectId.isValid(prospectId)) {
      return Response.json(
        { error: "Invalid property prospect." },
        { status: 400 },
      );
    }

    if (!/^ltr_[A-Za-z0-9]+$/.test(proofLetterId)) {
      return Response.json(
        { error: "A valid rendered Lob proof is required." },
        { status: 400 },
      );
    }

    validateAddress(to, "Recipient");
    validateAddress(from, "Return");

    if (!submittedBodyHtml) {
      return Response.json(
        { error: "Letter content is required." },
        { status: 400 },
      );
    }

    const finalHtml = buildLetterHtml(submittedBodyHtml);

    if (finalHtml.length > 10000) {
      return Response.json(
        { error: "This letter exceeds Lob's inline HTML limit." },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db("crm");
    const prospectCollection = db.collection("propertyProspects");
    const historyCollection = db.collection("letterHistory");
    const isPropertyOwnerLetter = Boolean(prospectId);
    const prospectObjectId = isPropertyOwnerLetter
      ? new ObjectId(prospectId)
      : null;
    const prospect = prospectObjectId
      ? await prospectCollection.findOne({ _id: prospectObjectId })
      : null;

    if (isPropertyOwnerLetter && !prospect) {
      return Response.json(
        { error: "Property prospect not found." },
        { status: 404 },
      );
    }

    await ensureLetterHistoryIndex(historyCollection);

    const existingCentralMail = await historyCollection.findOne({
      proofLetterId,
      environment: "live",
    });
    const existingProspectMail = (prospect?.mailHistory || []).find(
      (entry) =>
        entry?.environment === "live" &&
        entry?.proofLetterId === proofLetterId &&
        entry?.liveLetterId,
    );

    const existingMail = existingCentralMail || existingProspectMail;

    if (existingMail) {
      let savedHistory = existingCentralMail;

      if (!savedHistory) {
        const legacyHistory = {
          ...existingProspectMail,
          type: "letter",
          provider: "lob",
          source: "property_owner",
          prospectId: prospectObjectId,
          prospectName: getMailingContactName(prospect),
          bodyHtml: submittedBodyHtml,
          renderedHtml: finalHtml,
          createdAt:
            existingProspectMail.submittedAt || new Date().toISOString(),
        };

        await historyCollection.updateOne(
          { proofLetterId },
          { $setOnInsert: legacyHistory },
          { upsert: true },
        );
        savedHistory = await historyCollection.findOne({ proofLetterId });
      }

      return Response.json({
        alreadySubmitted: true,
        liveLetterId: existingMail.liveLetterId,
        proofLetterId,
        submittedAt: existingMail.submittedAt || "",
        sendDate: existingMail.sendDate || "",
        lobStatus: existingMail.lobStatus || "",
        letter: serializeLetter(savedHistory || existingMail),
        prospect: prospect ? serializeProspect(prospect) : null,
      });
    }

    const proofResponse = await lobFetch(
      "/letters/" + encodeURIComponent(proofLetterId),
      testApiKey,
      { method: "GET" },
    );
    const proof = await readLobResponse(
      proofResponse,
      "Could not verify the Lob test proof.",
    );

    if (proof.status !== "rendered") {
      return Response.json(
        { error: "The Lob test proof must finish rendering before live mail can be sent." },
        { status: 409 },
      );
    }

    const expectedProofSource = isPropertyOwnerLetter
      ? "crm_property_owner"
      : "crm_manual";
    const proofHasExpectedSource =
      clean(proof?.metadata?.source) === expectedProofSource;
    const proofHasExpectedProspect =
      !isPropertyOwnerLetter ||
      clean(proof?.metadata?.prospect_id) === prospectId;

    if (!proofHasExpectedSource || !proofHasExpectedProspect) {
      return Response.json(
        {
          error: isPropertyOwnerLetter
            ? "This proof is not linked to the selected CRM prospect."
            : "This proof is not linked to the manual CRM letter workspace.",
        },
        { status: 409 },
      );
    }

    const proofHash = createProofHash({
      prospectId,
      to,
      from,
      bodyHtml: submittedBodyHtml,
    });
    const savedProofHash = clean(proof?.metadata?.proof_hash);

    if (!savedProofHash) {
      return Response.json(
        {
          error:
            "This proof predates live-send verification. Generate a new Lob proof before mailing.",
        },
        { status: 409 },
      );
    }

    if (savedProofHash !== proofHash) {
      return Response.json(
        {
          error:
            "The letter or mailing address changed after this proof was generated. Create a new proof before mailing.",
        },
        { status: 409 },
      );
    }

    const idempotencyKey = isPropertyOwnerLetter
      ? "crm-property-letter:" + prospectId + ":" + proofLetterId
      : "crm-manual-letter:" + proofLetterId;

    const payload = {
      description: isPropertyOwnerLetter
        ? "CRM property owner live letter"
        : "CRM manual live letter",
      to,
      from,
      file: finalHtml,
      color: false,
      double_sided: false,
      address_placement: "top_first_page",
      mail_type: "usps_standard",
      use_type: "marketing",
      metadata: {
        source: isPropertyOwnerLetter
          ? "crm_property_owner_live"
          : "crm_manual_live",
        ...(isPropertyOwnerLetter ? { prospect_id: prospectId } : {}),
        proof_letter_id: proofLetterId,
        proof_hash: proofHash,
      },
    };

    const createResponse = await lobFetch("/letters", liveApiKey, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    const created = await readLobResponse(
      createResponse,
      "Lob did not accept the live letter.",
    );

    const now = new Date().toISOString();
    const historyEntry = {
      type: "letter",
      provider: "lob",
      source: isPropertyOwnerLetter ? "property_owner" : "manual",
      prospectId: prospectObjectId,
      prospectName: prospect ? getMailingContactName(prospect) : "",
      environment: "live",
      proofLetterId,
      liveLetterId: created.id,
      idempotencyKey,
      lobStatus: created.status || "processed",
      submittedAt: now,
      sendDate: created.send_date || "",
      expectedDeliveryDate: created.expected_delivery_date || "",
      recipient: to,
      returnAddress: from,
      bodyHtml: submittedBodyHtml,
      renderedHtml: finalHtml,
      createdAt: now,
    };

    await historyCollection.updateOne(
      { proofLetterId },
      { $setOnInsert: historyEntry },
      { upsert: true },
    );

    const savedHistory = await historyCollection.findOne({ proofLetterId });

    if (!isPropertyOwnerLetter) {
      return Response.json({
        alreadySubmitted: false,
        liveLetterId: created.id,
        proofLetterId,
        submittedAt: now,
        sendDate: created.send_date || "",
        expectedDeliveryDate: created.expected_delivery_date || "",
        lobStatus: created.status || "",
        letter: serializeLetter(savedHistory),
        prospect: null,
      });
    }

    const updateResult = await prospectCollection.updateOne(
      {
        _id: prospectObjectId,
        mailHistory: {
          $not: {
            $elemMatch: {
              environment: "live",
              proofLetterId,
            },
          },
        },
      },
      {
        $set: {
          mailStatus: "submitted",
          lastMailSubmittedAt: now,
          lastLiveLetterId: created.id,
          updatedAt: now,
        },
        $push: {
          mailHistory: historyEntry,
        },
      },
    );

    if (!updateResult.matchedCount) {
      const racedProspect = await prospectCollection.findOne({
        _id: prospectObjectId,
      });
      const racedMail = (racedProspect?.mailHistory || []).find(
        (entry) =>
          entry?.environment === "live" &&
          entry?.proofLetterId === proofLetterId &&
          entry?.liveLetterId,
      );

      return Response.json({
        alreadySubmitted: true,
        liveLetterId: racedMail?.liveLetterId || created.id,
        proofLetterId,
        submittedAt: racedMail?.submittedAt || now,
        sendDate: racedMail?.sendDate || created.send_date || "",
        lobStatus: racedMail?.lobStatus || created.status || "",
        letter: serializeLetter(savedHistory),
        prospect: serializeProspect(racedProspect || prospect),
      });
    }

    const updatedProspect = await prospectCollection.findOne({
      _id: prospectObjectId,
    });

    return Response.json({
      alreadySubmitted: false,
      liveLetterId: created.id,
      proofLetterId,
      submittedAt: now,
      sendDate: created.send_date || "",
      expectedDeliveryDate: created.expected_delivery_date || "",
      lobStatus: created.status || "",
      letter: serializeLetter(savedHistory),
      prospect: serializeProspect(updatedProspect),
    });
  } catch (error) {
    console.error("Lob live letter error:", error);

    return Response.json(
      {
        error: "Failed to submit live letter to Lob.",
        details: error.message,
      },
      { status: error.status || 500 },
    );
  }
}
