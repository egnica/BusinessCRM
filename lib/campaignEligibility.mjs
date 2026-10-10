export function campaignBlockedReason(contact) {
  if (!contact) return "Contact no longer exists. Refresh your contact list.";
  const status = typeof contact.emailStatus === "string"
    ? contact.emailStatus.trim().toLowerCase()
    : contact.emailStatus;
  if (status === "unsubscribed") return "Unsubscribed from email.";
  if (status !== undefined && status !== null && status !== "" && status !== "subscribed" && status !== "unknown") {
    return `Email status is ${String(contact.emailStatus)}. Review the contact's email status.`;
  }
  if (typeof contact.email !== "string" || !contact.email.trim()) {
    return "Missing email address.";
  }
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(contact.email.trim())) {
    return "Invalid email address. Correct it in the contact record.";
  }
  return "";
}

export function getBlockedCampaignContacts(ids, contacts) {
  const byId = new Map(contacts.map((contact) => [String(contact._id), contact]));
  return ids.flatMap((id) => {
    const contact = byId.get(id);
    const reason = campaignBlockedReason(contact);
    if (!reason) return [];
    return [{
      id,
      name: contact ? (contact.ownerNameRaw ||
        [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
        contact.company?.name || "Unnamed contact") : "Missing contact",
      email: typeof contact?.email === "string" ? contact.email : "",
      reason,
      exists: Boolean(contact),
    }];
  });
}
