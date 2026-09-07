import clientPromise from "@/lib/mongodb";
import { getMailingContactName } from "@/lib/propertyOwnerSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeLetter(letter) {
  return {
    ...letter,
    _id: letter._id?.toString?.() || letter._id || "",
    prospectId:
      letter.prospectId?.toString?.() || letter.prospectId || "",
  };
}

function dateValue(value) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const proofLetterId = String(
      url.searchParams.get("proofLetterId") || "",
    ).trim();
    const requestedLimit = Number(url.searchParams.get("limit") || 100);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 250)
      : 100;

    const client = await clientPromise;
    const db = client.db("crm");
    const historyFilter = proofLetterId
      ? { environment: "live", proofLetterId }
      : { environment: "live" };

    const [savedHistory, prospects] = await Promise.all([
      db
        .collection("letterHistory")
        .find(historyFilter)
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(limit)
        .toArray(),
      db
        .collection("propertyProspects")
        .find(
          { "mailHistory.0": { $exists: true } },
          {
            projection: {
              ownerNameRaw: 1,
              mailingContactName: 1,
              mailingAddress: 1,
              mailHistory: 1,
            },
          },
        )
        .toArray(),
    ]);

    const savedProofIds = new Set(
      savedHistory.map((letter) => letter.proofLetterId).filter(Boolean),
    );
    const legacyHistory = [];

    for (const prospect of prospects) {
      for (const entry of prospect.mailHistory || []) {
        if (
          entry?.environment !== "live" ||
          !entry?.liveLetterId ||
          (proofLetterId && entry?.proofLetterId !== proofLetterId) ||
          savedProofIds.has(entry?.proofLetterId)
        ) {
          continue;
        }

        legacyHistory.push({
          ...entry,
          _id: `legacy-${entry.liveLetterId}`,
          type: "letter",
          provider: "lob",
          source: "property_owner",
          prospectId: String(prospect._id),
          prospectName: getMailingContactName(prospect),
          createdAt: entry.submittedAt || "",
        });
      }
    }

    const letters = [...savedHistory, ...legacyHistory]
      .sort(
        (a, b) =>
          dateValue(b.submittedAt || b.createdAt) -
          dateValue(a.submittedAt || a.createdAt),
      )
      .slice(0, limit)
      .map(serializeLetter);

    return Response.json({ letters });
  } catch (error) {
    console.error("Letter history error:", error);
    return Response.json(
      { error: "Could not load letter history." },
      { status: 500 },
    );
  }
}
