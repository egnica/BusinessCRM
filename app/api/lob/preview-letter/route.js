import { createHash } from "crypto";
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
    throw new Error(
      label + " address is missing: " + missing.join(", "),
    );
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

async function readLobResponse(response) {
  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.status_code ||
      data?.message ||
      "Lob request failed.";

    throw new Error(message);
  }

  return data;
}

export async function GET(request) {
  try {
    const rawApiKey = process.env.LOB_TEST_API_KEY || "";
    const apiKey = rawApiKey.trim();

    if (!apiKey) {
      return Response.json(
        { error: "LOB_TEST_API_KEY is not configured." },
        { status: 500 },
      );
    }

    if (!apiKey.startsWith("test_") || apiKey.startsWith("test_pub_")) {
      return Response.json(
        {
          error:
            "LOB_TEST_API_KEY must be a Lob Test Secret API Key.",
        },
        { status: 500 },
      );
    }

    const url = new URL(request.url);
    const letterId = clean(url.searchParams.get("letterId"));

    if (!letterId) {
      return Response.json(
        { error: "letterId is required." },
        { status: 400 },
      );
    }

    const response = await lobFetch(
      "/letters/" + encodeURIComponent(letterId),
      apiKey,
      { method: "GET" },
    );

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        {
          error:
            data?.error?.message ||
            data?.message ||
            "Could not retrieve Lob letter status.",
        },
        { status: response.status },
      );
    }

    return Response.json({
      letterId: data.id,
      status: data.status,
      url: data.status === "rendered" ? data.url || "" : "",
      thumbnails: data.status === "rendered" ? data.thumbnails || [] : [],
      failureReason:
        data?.failure_reason?.message ||
        data?.failure_reason?.detail ||
        "",
      testMode: true,
    });
  } catch (error) {
    console.error("Lob proof status error:", error);

    return Response.json(
      {
        error: "Failed to check Lob proof status.",
        details: error.message,
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const rawApiKey = process.env.LOB_TEST_API_KEY || "";
    const apiKey = rawApiKey.trim();

    if (!apiKey) {
      return Response.json(
        { error: "LOB_TEST_API_KEY is not configured." },
        { status: 500 },
      );
    }

    if (!apiKey.startsWith("test_") || apiKey.startsWith("test_pub_")) {
      return Response.json(
        {
          error:
            "LOB_TEST_API_KEY must be a Lob Test Secret API Key. Publishable and live keys are not allowed here.",
        },
        { status: 500 },
      );
    }

    const body = await request.json();
    const to = normalizeAddress(body.to);
    const from = normalizeAddress(body.from);
    const submittedBodyHtml = clean(body.bodyHtml);

    validateAddress(to, "Recipient");
    validateAddress(from, "Return");

    if (!submittedBodyHtml) {
      return Response.json(
        {
          error: "Add letter content before previewing.",
        },
        { status: 400 },
      );
    }

    const finalHtml = buildLetterHtml(submittedBodyHtml);
    const proofHash = createProofHash({
      prospectId: body.prospectId,
      to,
      from,
      bodyHtml: submittedBodyHtml,
    });

    if (finalHtml.length > 10000) {
      return Response.json(
        {
          error:
            "This letter is too large for Lob's inline HTML input. Keep the finished HTML under 10,000 characters.",
          submittedHtmlLength: submittedBodyHtml.length,
          finalHtmlLength: finalHtml.length,
        },
        { status: 400 },
      );
    }

    const payload = {
      description: "CRM property owner test proof",
      to,
      from,
      file: finalHtml,
      color: false,
      double_sided: false,
      address_placement: "top_first_page",
      mail_type: "usps_standard",
      use_type: "marketing",
      metadata: {
        source: "crm_property_owner",
        prospect_id: clean(body.prospectId).slice(0, 500),
        proof_hash: proofHash,
      },
    };

    const createResponse = await lobFetch("/letters", apiKey, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const created = await readLobResponse(createResponse);

    return Response.json({
      letterId: created.id,
      status: created.status,
      proofHash,
      testMode: true,
    });
  } catch (error) {
    console.error("Lob preview error:", error);

    return Response.json(
      {
        error: "Failed to generate Lob test proof.",
        details: error.message,
      },
      { status: 500 },
    );
  }
}
