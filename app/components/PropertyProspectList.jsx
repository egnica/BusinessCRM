"use client";

import { useCallback, useEffect, useState } from "react";
import { copyPropertyProspectAiContext } from "@/lib/propertyProspectAiContext";
import styles from "../page.module.css";

function propertyAddress(property) {
  if (!property) return "No property address";
  return [
    property.street1,
    [property.city, property.state].filter(Boolean).join(", "),
    property.zip,
  ]
    .filter(Boolean)
    .join(" ");
}

function ownerTypeLabel(value) {
  if (value === "llc") return "LLC / Entity";
  if (value === "couple") return "Couple";
  if (value === "individual") return "Individual";
  return "Owner";
}

function statusLabel(value) {
  if (value === "not-interested") return "Not Interested";
  if (value === "interested") return "Interested";
  if (value === "archived") return "Archived";
  return "New";
}

function mailingName(prospect) {
  return prospect.mailingContactName || "—";
}

function mailStatusLabel(value) {
  if (value === "submitted") return "Submitted";
  if (value === "mailed") return "Mailed";
  return "Unmailed";
}

export default function PropertyProspectList({
  refreshKey,
  onSelect,
  onPromoted,
  onSendLetter,
}) {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("active");
  const [mailStatus, setMailStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());

  const loadProspects = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const params = new URLSearchParams({
        status,
        mailStatus,
      });

      if (query.trim()) params.set("query", query.trim());

      const res = await fetch(
        "/api/property-prospects?" + params.toString(),
        { cache: "no-store" },
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not load saved prospects.");
      }

      setProspects(data.prospects || []);
      setSelectedIds(new Set());
    } catch (error) {
      setMessage(error.message || "Could not load saved prospects.");
    } finally {
      setLoading(false);
    }
  }, [mailStatus, query, status]);

  useEffect(() => {
    loadProspects();
  }, [loadProspects, refreshKey]);

  function toggleProspect(prospectId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(prospectId)) next.delete(prospectId);
      else next.add(prospectId);
      return next;
    });
  }

  const allVisibleSelected =
    prospects.length > 0 &&
    prospects.every((prospect) => selectedIds.has(prospect._id));

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        prospects.forEach((prospect) => next.delete(prospect._id));
      } else {
        prospects.forEach((prospect) => next.add(prospect._id));
      }

      return next;
    });
  }

  async function copyAiContext(prospect) {
    setMessage("");

    try {
      await copyPropertyProspectAiContext(prospect);
      setMessage(
        "AI context copied for " +
          (prospect.mailingContactName || prospect.ownerNameRaw) +
          ". Paste it into a chat to draft the letter.",
      );
    } catch {
      setMessage("Could not copy AI context to the clipboard.");
    }
  }

  async function promoteProspect(prospect) {
    if (prospect.crmContactId) return;

    const confirmed = window.confirm(
      "Add " +
        prospect.ownerNameRaw +
        " to the main CRM? The saved prospect will remain linked here.",
    );

    if (!confirmed) return;

    setMessage("");

    try {
      const res = await fetch(
        "/api/property-prospects/" + prospect._id + "/promote",
        { method: "POST" },
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not add prospect to CRM.");
      }

      setProspects((current) =>
        current.map((item) =>
          item._id === prospect._id
            ? { ...item, crmContactId: data.contactId }
            : item,
        ),
      );

      setMessage(
        data.alreadyExists
          ? "Prospect linked to its existing CRM contact."
          : "Prospect added to the main CRM.",
      );
      onPromoted?.(prospect._id, data.contactId);
    } catch (error) {
      setMessage(error.message || "Could not add prospect to CRM.");
    }
  }

  async function deleteProspect(prospect) {
    const confirmed = window.confirm(
      "Delete " +
        prospect.ownerNameRaw +
        " from Saved Prospects? This will not delete any CRM contact.",
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(
        "/api/property-prospects/" + prospect._id,
        { method: "DELETE" },
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not delete prospect.");
      }

      setProspects((current) =>
        current.filter((item) => item._id !== prospect._id),
      );
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(prospect._id);
        return next;
      });
      setMessage("Deleted saved prospect.");
    } catch (error) {
      setMessage(error.message || "Could not delete prospect.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;

    const confirmed = window.confirm(
      "Delete " +
        ids.length +
        " selected saved prospect" +
        (ids.length === 1 ? "" : "s") +
        "? This will not delete any CRM contacts.",
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/property-prospects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not delete selected prospects.");
      }

      const deletedIds = new Set(ids);
      setProspects((current) =>
        current.filter((item) => !deletedIds.has(item._id)),
      );
      setSelectedIds(new Set());
      setMessage(
        "Deleted " +
          data.deletedCount +
          " saved prospect" +
          (data.deletedCount === 1 ? "" : "s") +
          ".",
      );
    } catch (error) {
      setMessage(error.message || "Could not delete selected prospects.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.propertyResultsPanel}>
      <div className={styles.propertyResultsHeading}>
        <div>
          <p className={styles.eyebrow}>Curated working list</p>
          <h2>Saved Prospects</h2>
          <p>
            These owners stay separate from the main CRM until you
            intentionally promote one.
          </p>
        </div>
      </div>

      <div className={styles.propertySavedToolbar}>
        <input
          type="search"
          placeholder="Search owner or property..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") loadProspects();
          }}
        />

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="active">Active prospects</option>
          <option value="new">New</option>
          <option value="interested">Interested</option>
          <option value="not-interested">Not Interested</option>
          <option value="archived">Archived</option>
          <option value="all">All statuses</option>
        </select>

        <select
          value={mailStatus}
          onChange={(event) => setMailStatus(event.target.value)}
        >
          <option value="all">All mail statuses</option>
          <option value="unmailed">Unmailed</option>
          <option value="submitted">Submitted</option>
          <option value="mailed">Mailed</option>
        </select>

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={loadProspects}
          disabled={loading}
        >
          {loading ? "Loading…" : "Apply"}
        </button>
      </div>

      <div className={styles.propertySavedBulkBar}>
        <span>
          {selectedIds.size} selected
        </span>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled
          title="Bulk letter sending will be added after the individual Lob workflow is validated."
        >
          Send Letter to Selected
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={deleteSelected}
          disabled={loading || selectedIds.size === 0}
        >
          Delete Selected
        </button>
      </div>

      {message && (
        <p className={styles.newsletterStatus}>{message}</p>
      )}

      <div className={styles.propertySavedTable}>
        <div className={styles.propertySavedHeader}>
          <span>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
              disabled={!prospects.length}
              aria-label="Select visible prospects"
            />
          </span>
          <span>Owner</span>
          <span>Mailing Name</span>
          <span>Target Property</span>
          <span>Portfolio</span>
          <span>Status</span>
          <span>Mail</span>
          <span>CRM</span>
          <span>Actions</span>
        </div>

        {prospects.length ? (
          prospects.map((prospect) => (
            <div className={styles.propertySavedRow} key={prospect._id}>
              <span>
                <input
                  type="checkbox"
                  checked={selectedIds.has(prospect._id)}
                  onChange={() => toggleProspect(prospect._id)}
                  aria-label={"Select " + prospect.ownerNameRaw}
                />
              </span>

              <button
                type="button"
                className={styles.propertyOwnerNameButton}
                onClick={() => onSelect?.(prospect)}
              >
                <strong>{prospect.ownerNameRaw}</strong>
                <span>Mailing: {mailingName(prospect)}</span>
              </button>

              <span>{mailingName(prospect)}</span>

              <div>
                <strong>{propertyAddress(prospect.primaryProperty)}</strong>
                <span>
                  {prospect.primaryProperty?.numUnits || "—"} units ·{" "}
                  {prospect.primaryProperty?.ownershipYears ?? "—"} years
                </span>
              </div>

              <span>
                {prospect.metroLookup?.confirmedPropertyCount
                  ? `${prospect.metroLookup.confirmedPropertyCount} metro`
                  : prospect.metroPropertyCount
                    ? `${prospect.metroPropertyCount} metro found`
                    : `${prospect.cityPropertyCount || prospect.propertyCount || prospect.properties?.length || 1} in ${prospect.searchCity || prospect.primaryProperty?.municipality || "city"}`}
              </span>

              <span>
                <span className={styles.propertyStatusBadge}>
                  {statusLabel(prospect.status)}
                </span>
              </span>

              <span>
                <span className={styles.propertyMailBadge}>
                  {mailStatusLabel(prospect.mailStatus)}
                </span>
              </span>

              <span>
                {prospect.crmContactId ? (
                  <span
                    className={
                      styles.propertySourceBadge +
                      " " +
                      styles.propertyInCrmBadge
                    }
                  >
                    IN CRM
                  </span>
                ) : (
                  "—"
                )}
              </span>

              <div className={styles.propertyRowActions}>
                <button
                  type="button"
                  onClick={() => onSelect?.(prospect)}
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => onSendLetter?.(prospect)}
                >
                  Send Letter
                </button>
                <button
                  type="button"
                  onClick={() => copyAiContext(prospect)}
                >
                  Copy AI Context
                </button>
                <button
                  type="button"
                  onClick={() => promoteProspect(prospect)}
                  disabled={Boolean(prospect.crmContactId)}
                >
                  {prospect.crmContactId ? "In CRM" : "Add to CRM"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteProspect(prospect)}
                  disabled={loading}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            <strong>No saved prospects in this view.</strong>
            <span>Use Find Owners to build a focused outreach list.</span>
          </div>
        )}
      </div>
    </section>
  );
}
