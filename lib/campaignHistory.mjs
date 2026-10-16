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
