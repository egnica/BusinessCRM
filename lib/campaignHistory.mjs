export function campaignEngagementPipeline(sendIds) {
  return [
    { $match: { campaignId: { $in: sendIds } } },
    {
      $group: {
        _id: {
          campaignId: "$campaignId",
          recipientEmail: { $toLower: { $ifNull: ["$recipientEmail", ""] } },
        },
        opened: {
          $max: {
            $cond: [
              { $ne: [{ $ifNull: ["$eventTimestamps.openedAt", null] }, null] },
              1,
              0,
            ],
          },
        },
        clicked: {
          $max: {
            $cond: [
              { $ne: [{ $ifNull: ["$eventTimestamps.clickedAt", null] }, null] },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $group: {
        _id: "$_id.campaignId",
        openedCount: { $sum: "$opened" },
        clickedCount: { $sum: "$clicked" },
      },
    },
  ];
}

export function campaignRecipientStatus(recipient, activity) {
  if (recipient.unsubscribedAt || recipient.status === "unsubscribed") {
    return "unsubscribed";
  }
  return activity?.status || recipient.status || "sent";
}

// Prioritize engagement, then problems, then delivered mail. No additional
// filtering UI is needed; the existing recipient table uses API order.
const RECIPIENT_STATUS_ORDER = {
  clicked: 0,
  opened: 1,
  failed: 2,
  bounced: 2,
  complained: 2,
  suppressed: 2,
  delayed: 2,
  unsubscribed: 3,
  delivered: 4,
  sent: 5,
  sending: 5,
};

const STATUS_TIMESTAMP_FIELDS = {
  clicked: "clickedAt",
  opened: "openedAt",
  failed: "failedAt",
  bounced: "bouncedAt",
  complained: "complainedAt",
  suppressed: "suppressedAt",
  delayed: "delayedAt",
  delivered: "deliveredAt",
  sent: "sentAt",
};

export function campaignRecipientActivityAt(recipient, activity, status) {
  if (status === "unsubscribed" && recipient.unsubscribedAt) {
    return recipient.unsubscribedAt;
  }

  const statusTimestamp = activity?.eventTimestamps?.[STATUS_TIMESTAMP_FIELDS[status]];
  return statusTimestamp || activity?.lastEventAt || activity?.updatedAt ||
    activity?.sentAt || recipient.sentAt || recipient.updatedAt ||
    recipient.createdAt || null;
}

function timestamp(value) {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : 0;
}

export function sortCampaignRecipients(recipients) {
  return [...recipients].sort((a, b) => {
    const rankA = RECIPIENT_STATUS_ORDER[String(a.status || "").toLowerCase()] ?? 6;
    const rankB = RECIPIENT_STATUS_ORDER[String(b.status || "").toLowerCase()] ?? 6;
    if (rankA !== rankB) return rankA - rankB;

    const newestFirst = timestamp(b.lastActivityAt) - timestamp(a.lastActivityAt);
    if (newestFirst) return newestFirst;

    return String(a.email || "").localeCompare(String(b.email || ""));
  });
}
