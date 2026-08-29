"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function propertyAddress(property) {
  if (!property) return "No property selected";

  return [
    property.street1,
    [property.city, property.state].filter(Boolean).join(", "),
    property.zip,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function PropertyProspectPanel({
  prospect,
  onClose,
  onUpdated,
  onPromoted,
}) {
  const [status, setStatus] = useState(prospect?.status || "new");
  const [notes, setNotes] = useState(prospect?.notes || "");
  const [primaryParcelId, setPrimaryParcelId] = useState(
    prospect?.primaryParcelId || prospect?.properties?.[0]?.parcelId || "",
  );
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setStatus(prospect?.status || "new");
    setNotes(prospect?.notes || "");
    setPrimaryParcelId(
      prospect?.primaryParcelId || prospect?.properties?.[0]?.parcelId || "",
    );
    setMessage("");
  }, [prospect]);

  if (!prospect) return null;

  async function handleSave() {
    setWorking(true);
    setMessage("");

    try {
      const res = await fetch(`/api/property-prospects/${prospect._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          notes,
          primaryParcelId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Could not save prospect.");
        return;
      }

      setMessage("Prospect saved.");
      onUpdated?.(data.prospect);
    } catch {
      setMessage("Could not save prospect.");
    } finally {
      setWorking(false);
    }
  }

  async function handlePromote() {
    if (prospect.crmContactId) return;

    const confirmed = window.confirm(
      `Add ${prospect.ownerNameRaw} to the main CRM? The property prospect will remain here and link to the new CRM contact.`,
    );

    if (!confirmed) return;

    setWorking(true);
    setMessage("");

    try {
      const res = await fetch(
        `/api/property-prospects/${prospect._id}/promote`,
        {
          method: "POST",
        },
      );
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Could not add prospect to the CRM.");
        return;
      }

      setMessage(
        data.alreadyExists
          ? "This prospect is already linked to a CRM contact."
          : "Added to the main CRM.",
      );
      onPromoted?.(prospect._id, data.contactId);
    } catch {
      setMessage("Could not add prospect to the CRM.");
    } finally {
      setWorking(false);
    }
  }

  const selectedProperty =
    (prospect.properties || []).find(
      (property) => property.parcelId === primaryParcelId,
    ) ||
    prospect.primaryProperty ||
    prospect.properties?.[0];

  return (
    <>
      <div
        className={styles.panelBackdrop}
        onClick={working ? undefined : onClose}
        aria-hidden="true"
      />

      <aside
        className={styles.customerPanelContain}
        aria-label="Property prospect details"
      >
        <div className={styles.customerPanelHeader}>
          <div className={styles.customerPanelHeaderTop}>
            <div>
              <p className={styles.eyebrow}>Saved property prospect</p>
              <h3>{prospect.ownerNameRaw}</h3>
              <p className={styles.panelSubtitle}>
                {prospect.ownerType === "llc"
                  ? "LLC / Entity"
                  : prospect.ownerType === "couple"
                    ? "Couple"
                    : "Individual"}
                {prospect.propertyCount > 1
                  ? ` · ${prospect.propertyCount} properties`
                  : ""}
              </p>
            </div>

            <div className={styles.panelHeaderActions}>
              <button
                type="button"
                className={styles.customerPanelClose}
                onClick={onClose}
                disabled={working}
              >
                Close
              </button>
            </div>
          </div>
        </div>

        <div className={styles.customerPanelScroll}>
          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Prospect Status</h4>
              <p>Keep the working prospect list organized without moving it into the main CRM.</p>
            </div>

            <div className={styles.customerPanelGrid}>
              <label className={styles.customerPanelField}>
                <span>Status</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="new">New</option>
                  <option value="interested">Interested</option>
                  <option value="not-interested">Not Interested</option>
                  <option value="archived">Archived</option>
                </select>
              </label>

              <div className={styles.customerPanelField}>
                <span>Mail Status</span>
                <div className={styles.propertyReadOnlyValue}>
                  {prospect.mailStatus === "mailed" ? "Mailed" : "Unmailed"}
                </div>
              </div>
            </div>
          </section>

          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Target Property</h4>
              <p>Choose which property this outreach record should primarily reference.</p>
            </div>

            <label className={styles.customerPanelField}>
              <span>Primary property</span>
              <select
                value={primaryParcelId}
                onChange={(event) => setPrimaryParcelId(event.target.value)}
              >
                {(prospect.properties || []).map((property) => (
                  <option value={property.parcelId} key={property.parcelId}>
                    {propertyAddress(property)}
                  </option>
                ))}
              </select>
            </label>

            {selectedProperty && (
              <div className={styles.propertyDetailCard}>
                <strong>{propertyAddress(selectedProperty)}</strong>
                <div className={styles.propertyDetailGrid}>
                  <span>
                    <small>Units</small>
                    {selectedProperty.numUnits || "—"}
                  </span>
                  <span>
                    <small>Years owned</small>
                    {selectedProperty.ownershipYears ?? "—"}
                  </span>
                  <span>
                    <small>Year built</small>
                    {selectedProperty.yearBuilt || "—"}
                  </span>
                  <span>
                    <small>Assessed value</small>
                    {formatMoney(selectedProperty.assessedValue)}
                  </span>
                  <span>
                    <small>Homestead</small>
                    {selectedProperty.homestead || "Unknown"}
                  </span>
                  <span>
                    <small>Parcel</small>
                    {selectedProperty.parcelId || "—"}
                  </span>
                </div>
              </div>
            )}
          </section>

          {(prospect.properties || []).length > 1 && (
            <section className={styles.panelSection}>
              <div className={styles.panelSectionHeader}>
                <h4>Matching Properties</h4>
                <p>Other qualifying parcels associated with this owner in the saved research.</p>
              </div>

              <div className={styles.propertyPortfolio}>
                {(prospect.properties || []).map((property) => (
                  <div
                    className={styles.propertyPortfolioRow}
                    key={property.parcelId}
                  >
                    <div>
                      <strong>{propertyAddress(property)}</strong>
                      <span>
                        {property.numUnits || "—"} units
                        {property.yearBuilt
                          ? ` · Built ${property.yearBuilt}`
                          : ""}
                      </span>
                    </div>
                    <div>
                      <span>
                        {property.ownershipYears != null
                          ? `${property.ownershipYears} years since recorded sale`
                          : "Sale date unavailable"}
                      </span>
                      <small>{formatMoney(property.assessedValue)}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Owner Mailing Address</h4>
              <p>Public parcel mailing information saved only for owners you intentionally selected.</p>
            </div>

            <div className={styles.propertyMailAddress}>
              <strong>
                {prospect.mailingAddress?.recipientName ||
                  prospect.ownerNameRaw}
              </strong>
              {(prospect.mailingAddress?.lines || []).length ? (
                prospect.mailingAddress.lines.map((line) => (
                  <span key={line}>{line}</span>
                ))
              ) : (
                <span>No mailing address available in the parcel record.</span>
              )}
            </div>
          </section>

          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Notes</h4>
              <p>Add research or context before deciding whether to contact the owner.</p>
            </div>

            <label className={styles.customerPanelField}>
              <span>Prospect notes</span>
              <textarea
                rows={6}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Research notes, property context, outreach thoughts..."
              />
            </label>
          </section>

          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Actions</h4>
              <p>Physical mail will be enabled in Phase 2 after PostGrid is connected.</p>
            </div>

            <div className={styles.propertyProspectActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled
                title="PostGrid will be connected in Phase 2"
              >
                Send Letter
              </button>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handlePromote}
                disabled={working || Boolean(prospect.crmContactId)}
              >
                {prospect.crmContactId ? "In Main CRM" : "Add to CRM"}
              </button>
            </div>

            {message && (
              <p className={styles.newsletterStatus}>{message}</p>
            )}
          </section>
        </div>

        <div className={styles.customerPanelFooter}>
          <button
            type="button"
            className={styles.customerPanelClose}
            onClick={onClose}
            disabled={working}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.customerPanelSave}
            onClick={handleSave}
            disabled={working}
          >
            {working ? "Saving…" : "Save Prospect"}
          </button>
        </div>
      </aside>
    </>
  );
}
