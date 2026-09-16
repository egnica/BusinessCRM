import {
  deriveTrackingSummary,
  mergeTrackingEvents,
} from "@/lib/lobTracking";

function buildTrackingUpdate({
  existingEvents,
  incomingEvents,
  providerStatus,
  submittedAt,
  sendDate,
  expectedDeliveryDate,
}) {
  const trackingEvents = mergeTrackingEvents(existingEvents, incomingEvents);
  const summary = deriveTrackingSummary({
    trackingEvents,
    providerStatus,
    submittedAt,
  });
  const now = new Date().toISOString();

  return {
    trackingEvents,
    lobStatus: summary.currentStatus,
    lobStatusLabel: summary.statusLabel,
    lobStatusTone: summary.statusTone,
    lobStatusUpdatedAt: summary.statusUpdatedAt,
    lobAttentionRequired: summary.attentionRequired,
    lobProviderStatus: providerStatus || "",
    lastLobSyncedAt: now,
    ...(sendDate ? { sendDate } : {}),
    ...(expectedDeliveryDate ? { expectedDeliveryDate } : {}),
  };
}

export async function applyLobTrackingUpdate(
  db,
  {
    liveLetterId,
    incomingEvents = [],
    providerStatus = "",
    sendDate = "",
    expectedDeliveryDate = "",
  },
) {
  const historyCollection = db.collection("letterHistory");
  const prospectCollection = db.collection("propertyProspects");
  let matchedRecords = 0;

  const centralLetter = await historyCollection.findOne({ liveLetterId });

  if (centralLetter) {
    const update = buildTrackingUpdate({
      existingEvents: centralLetter.trackingEvents,
      incomingEvents,
      providerStatus,
      submittedAt: centralLetter.submittedAt,
      sendDate,
      expectedDeliveryDate,
    });

    await historyCollection.updateOne(
      { _id: centralLetter._id },
      { $set: update },
    );
    matchedRecords += 1;
  }

  const prospects = await prospectCollection
    .find(
      { "mailHistory.liveLetterId": liveLetterId },
      { projection: { mailHistory: 1, lastLiveLetterId: 1 } },
    )
    .toArray();

  for (const prospect of prospects) {
    const letter = (prospect.mailHistory || []).find(
      (entry) => entry?.liveLetterId === liveLetterId,
    );
    if (!letter) continue;

    const update = buildTrackingUpdate({
      existingEvents: letter.trackingEvents,
      incomingEvents,
      providerStatus,
      submittedAt: letter.submittedAt,
      sendDate,
      expectedDeliveryDate,
    });
    const setValues = Object.fromEntries(
      Object.entries(update).map(([key, value]) => [
        `mailHistory.$[letter].${key}`,
        value,
      ]),
    );

    if (prospect.lastLiveLetterId === liveLetterId) {
      setValues.mailStatus = update.lobStatus;
      setValues.lastMailStatusAt = update.lobStatusUpdatedAt;
    }

    await prospectCollection.updateOne(
      { _id: prospect._id },
      { $set: setValues },
      { arrayFilters: [{ "letter.liveLetterId": liveLetterId }] },
    );
    matchedRecords += 1;
  }

  return { matchedRecords };
}
