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

function propertyLabel(property) {
  if (!property) return "No property address";

  return [
    property.street1,
    [property.city, property.state].filter(Boolean).join(", "),
    property.zip,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function PropertyOwnerImport({
  onClose,
  onImported,
}) {
  const [limit, setLimit] = useState(250);
  const [summary, setSummary] = useState(null);
  const [prospects, setProspects] = useState([]);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  async function loadPreview(nextLimit = limit) {
    setWorking(true);
    setStatus("");

    try {
      const res = await fetch(`/api/property-owners?limit=${nextLimit}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Could not build property owner preview.");
        return;
      }

      setSummary(data.summary || null);
      setProspects(data.prospects || []);
    } catch {
      setStatus("Could not build property owner preview.");
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    loadPreview(250);
  }, []);

  async function handleLimitChange(value) {
    const nextLimit = Number(value);
    setLimit(nextLimit);
    await loadPreview(nextLimit);
  }

  async function handleImport() {
    const count = summary?.previewCount || limit;
    const confirmed = window.confirm(
      `Import up to ${count} screened property owner prospects into the CRM? Existing imported parcel-owner records will be refreshed instead of duplicated.`,
    );

    if (!confirmed) return;

    setWorking(true);
    setStatus("");

    try {
      const res = await fetch("/api/property-owners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Property owner import failed.");
        return;
      }

      setStatus(
        `Import complete: ${data.importedCount || 0} new contacts, ${data.updatedCount || 0} refreshed.`,
      );
      await onImported?.();
      await loadPreview(limit);
    } catch {
      setStatus("Property owner import failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className={styles.newsletterBackdrop} onClick={onClose} />
      <section
        className={styles.newsletterModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-import-title"
      >
        <div className={styles.newsletterModalHeader}>
          <div>
            <p className={styles.eyebrow}>Property owner outreach</p>
            <h2 id="property-import-title">Find property owners</h2>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={working}
          >
            Close
          </button>
        </div>

        <div className={styles.newsletterModalBody}>
          <p className={styles.propertyImportIntro}>
            Screen current MetroGIS parcel records for long-held 2–20 unit
            residential properties in Minneapolis and Saint Paul. Multiple
            qualifying parcels under the same owner are grouped into one CRM
            contact.
          </p>

          <div className={styles.propertyImportCriteria}>
            <span>10+ years since recorded sale</span>
            <span>2–20 residential units</span>
            <span>Individual, couple, LLC / entity</span>
            <span>No bulk phone, email, or personal mailing-address harvesting</span>
          </div>

          <label className={styles.newsletterField}>
            <span>Maximum owners to import</span>
            <select
              value={limit}
              onChange={(e) => handleLimitChange(e.target.value)}
              disabled={working}
            >
              <option value={100}>100 prospects</option>
              <option value={250}>250 prospects</option>
              <option value={500}>500 prospects</option>
            </select>
          </label>

          {working && !summary && (
            <p className={styles.newsletterStatus}>
              Screening public parcel records…
            </p>
          )}

          {summary && (
            <div className={styles.propertyImportStats}>
              <div>
                <strong>{summary.scannedProperties || 0}</strong>
                <span>candidate parcels scanned</span>
              </div>
              <div>
                <strong>{summary.matchedOwners || 0}</strong>
                <span>owners matched</span>
              </div>
              <div>
                <strong>{summary.previewCount || 0}</strong>
                <span>selected for this import</span>
              </div>
            </div>
          )}

          {prospects.length > 0 && (
            <div className={styles.propertyImportPreview}>
              <div className={styles.propertyImportPreviewHeader}>
                <strong>Top preview</strong>
                <span>Showing {prospects.length} screened owners</span>
              </div>

              <div className={styles.propertyImportRows}>
                {prospects.map((prospect) => (
                  <div
                    className={styles.propertyImportRow}
                    key={prospect.key}
                  >
                    <div>
                      <strong>{prospect.ownerName}</strong>
                      {prospect.ownerMore && (
                        <span>{prospect.ownerMore}</span>
                      )}
                      <small>
                        {prospect.ownerType === "llc"
                          ? "LLC / Entity"
                          : prospect.ownerType === "couple"
                            ? "Couple"
                            : "Individual"}
                        {prospect.propertyCount > 1
                          ? ` · ${prospect.propertyCount} matching properties`
                          : ""}
                      </small>
                    </div>

                    <div>
                      <strong>
                        {propertyLabel(prospect.primaryProperty)}
                      </strong>
                      <span>
                        {prospect.primaryProperty?.numUnits || "—"} units
                        {prospect.primaryProperty?.ownershipYears != null
                          ? ` · ${prospect.primaryProperty.ownershipYears} years since recorded sale`
                          : " · sale date unavailable"}
                      </span>
                      <small>
                        Assessed value:{" "}
                        {formatMoney(
                          prospect.primaryProperty?.assessedValue,
                        )}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {status && (
            <p className={styles.newsletterStatus}>{status}</p>
          )}

          <div className={styles.newsletterActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => loadPreview(limit)}
              disabled={working}
            >
              {working ? "Working…" : "Refresh Preview"}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleImport}
              disabled={working || !summary?.previewCount}
            >
              Import Property Owners
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
