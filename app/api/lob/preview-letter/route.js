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
  const content = clean(bodyHtml) || "<p>&nbsp;</p>";

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    "<style>",
    "@page { size: 8.5in 11in; margin: 0.65in 0.75in 0.75in; }",
    "html, body { padding: 0; }",
    "body { margin: 0; color: #111827; font-family: Georgia, 'Times New Roman', serif; font-size: 11.5pt; line-height: 1.55; }",
    ".lob-address-space { height: 2.25in; }",
    ".letter-content { width: 100%; }",
    ".letter-content p { margin: 0 0 0.95em; }",
    ".letter-content ul, .letter-content ol { margin: 0 0 0.95em 1.25em; padding: 0; }",
    ".letter-content a { color: inherit; }",
    "</style>",
    "</head>",
    "<body>",
    '<div class="lob-address-space" aria-hidden="true"></div>',
    '<main class="letter-content">',
    content,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
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

async function waitForProof(letterId, apiKey, initialLetter) {
  let letter = initialLetter;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (letter?.status === "rendered" || letter?.status === "failed") {
      return letter;
    }

    await new Promise((resolve) => setTimeout(resolve, 800));

    const response = await lobFetch("/letters/" + letterId, apiKey, {
      method: "GET",
    });
    letter = await readLobResponse(response);
  }

  if (letter?.status === "rendered") {
    const response = await lobFetch("/letters/" + letterId, apiKey, {
      method: "GET",
    });
    return readLobResponse(response);
  }

  return letter;
}

export async function GET() {
  try {
    const rawApiKey = process.env.LOB_TEST_API_KEY || "";
    const apiKey = rawApiKey.trim();

    const diagnostic = {
      configured: Boolean(rawApiKey),
      prefix: rawApiKey.startsWith("test_pub_")
        ? "test_pub_"
        : rawApiKey.startsWith("test_")
          ? "test_"
          : rawApiKey
            ? "other"
            : "missing",
      length: rawApiKey.length,
      trimmedLength: apiKey.length,
      hasLeadingOrTrailingWhitespace: rawApiKey !== apiKey,
      lobAuthStatus: null,
      lobAuthOk: false,
      lobMessage: "",
    };

    if (!rawApiKey) {
      return Response.json(diagnostic, { status: 500 });
    }

    const response = await lobFetch("/addresses", apiKey, {
      method: "GET",
    });

    diagnostic.lobAuthStatus = response.status;
    diagnostic.lobAuthOk = response.ok;

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      diagnostic.lobMessage =
        data?.error?.message ||
        data?.message ||
        "Lob rejected the authentication request.";
    }

    return Response.json(diagnostic, {
      status: response.ok ? 200 : 502,
    });
  } catch (error) {
    console.error("Lob diagnostic error:", error);

    return Response.json(
      {
        configured: Boolean(process.env.LOB_TEST_API_KEY),
        prefix: process.env.LOB_TEST_API_KEY?.startsWith("test_pub_")
          ? "test_pub_"
          : process.env.LOB_TEST_API_KEY?.startsWith("test_")
            ? "test_"
            : process.env.LOB_TEST_API_KEY
              ? "other"
              : "missing",
        length: process.env.LOB_TEST_API_KEY?.length || 0,
        trimmedLength: process.env.LOB_TEST_API_KEY?.trim?.().length || 0,
        hasLeadingOrTrailingWhitespace:
          Boolean(process.env.LOB_TEST_API_KEY) &&
          process.env.LOB_TEST_API_KEY !== process.env.LOB_TEST_API_KEY.trim(),
        lobAuthStatus: null,
        lobAuthOk: false,
        lobMessage: error.message || "Diagnostic request failed.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const apiKey = process.env.LOB_TEST_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "LOB_TEST_API_KEY is not configured." },
        { status: 500 },
      );
    }

    if (!apiKey.startsWith("test_")) {
      return Response.json(
        {
          error:
            "LOB_TEST_API_KEY must be a Lob test key. Live mailing is intentionally disabled here.",
        },
        { status: 500 },
      );
    }

    const body = await request.json();
    const to = normalizeAddress(body.to);
    const from = normalizeAddress(body.from);

    validateAddress(to, "Recipient");
    validateAddress(from, "Return");

    const payload = {
      description: "CRM property owner test proof",
      to,
      from,
      file: buildLetterHtml(body.bodyHtml),
      color: false,
      double_sided: false,
      address_placement: "top_first_page",
      mail_type: "usps_standard",
      use_type: "marketing",
      metadata: {
        source: "crm_property_owner",
        prospect_id: clean(body.prospectId).slice(0, 500),
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
    const letter = await waitForProof(created.id, apiKey, created);

    if (letter?.status === "failed") {
      return Response.json(
        {
          error: "Lob could not render the letter proof.",
          details:
            letter?.failure_reason?.message ||
            letter?.failure_reason?.detail ||
            "Check the letter HTML and addresses.",
        },
        { status: 422 },
      );
    }

    return Response.json({
      letterId: letter.id,
      status: letter.status,
      url: letter.url || "",
      thumbnails: letter.thumbnails || [],
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
