"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./CommunicationWorkspace.module.css";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAddress(address) {
  if (!address) return "Not recorded";

  return [
    address.name,
    address.address_line1,
    address.address_line2,
    [address.address_city, address.address_state, address.address_zip]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join("\n");
}

function sourceLabel(source) {
  return source === "property_owner" ? "Property Owner" : "Manual Letter";
}

export default function LetterHistory({ refreshKey = 0 }) {
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  const loadHistory = useCallback(async ({ sync = false } = {}) => {
    setLoading(true);
    setMessage("");
    setNotice("");

    try {
      if (sync) {
        const syncResponse = await fetch("/api/lob/history/sync", {
          method: "POST",
        });
        const syncData = await syncResponse.json();

        if (!syncResponse.ok) {
          throw new Error(syncData.error || "Could not sync with Lob.");
        }

        const checked = syncData.checked ?? syncData.synced ?? 0;
        const withTrackingHistory = syncData.withTrackingHistory ?? 0;
        const failureMessage = syncData.failed
          ? ` ${syncData.failed} could not be checked.`
          : "";

        setNotice(
          withTrackingHistory > 0
            ? `Checked ${checked} letters. Lob supplied tracking history for ${withTrackingHistory}.${failureMessage}`
            : `Checked ${checked} letters. No historical tracking events were available. Future webhook updates will appear automatically.${failureMessage}`,
        );
      }

      const response = await fetch(
        `/api/lob/history?limit=100&refresh=${refreshKey}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load letter history.");
      }

      setLetters(data.letters || []);
    } catch (error) {
      setMessage(error.message || "Could not load letter history.");
    } finally {
      setLoading(false);
    }
  }, [refreshKey]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <section className={styles.historyPanel}>
      <div className={styles.historyToolbar}>
        <div>
          <p className={styles.eyebrow}>Lob activity</p>
          <h2>Letter History</h2>
        </div>
        <button
          type="button"
          onClick={() => loadHistory({ sync: true })}
          disabled={loading}
        >
          {loading ? "Syncing…" : "Sync with Lob"}
        </button>
      </div>

      {message && <p className={styles.historyStatus}>{message}</p>}
      {notice && <p className={styles.historyNotice}>{notice}</p>}

      {!loading && !message && letters.length === 0 && (
        <p className={styles.historyEmpty}>
          No live letters have been submitted yet.
        </p>
      )}

      <div className={styles.historyList}>
        {letters.map((letter) => (
          <details
            className={styles.historyCard}
            key={letter._id || letter.liveLetterId}
          >
            <summary>
              <div className={styles.summaryPrimary}>
                <strong>{letter.recipient?.name || "Unnamed recipient"}</strong>
                <span>{formatDateTime(letter.submittedAt)}</span>
              </div>
              <div className={styles.summarySecondary}>
                <strong>{sourceLabel(letter.source)}</strong>
                <span>{letter.prospectName || letter.liveLetterId || ""}</span>
              </div>
              <div className={styles.statusSummary}>
                <span
                  className={styles.statusBadge}
                  data-tone={letter.statusTone || "neutral"}
                >
                  {letter.statusLabel || "Submitted to Lob"}
                </span>
                <span>{formatDateTime(letter.statusUpdatedAt)}</span>
              </div>
            </summary>

            <div className={styles.historyDetails}>
              <div className={styles.metaGrid}>
                <div className={styles.metaCard}>
                  <span>Lob ID</span>
                  <strong>{letter.liveLetterId || "—"}</strong>
                </div>
                <div className={styles.metaCard}>
                  <span>Proof ID</span>
                  <strong>{letter.proofLetterId || "—"}</strong>
                </div>
                <div className={styles.metaCard}>
                  <span>Expected delivery</span>
                  <strong>{formatDate(letter.expectedDeliveryDate)}</strong>
                </div>
                <div className={styles.metaCard}>
                  <span>Current status</span>
                  <strong>{letter.statusLabel || "Submitted to Lob"}</strong>
                </div>
              </div>

              <div className={styles.trackingPanel}>
                <div className={styles.trackingHeader}>
                  <div>
                    <strong>Mail tracking</strong>
                    <span>Production and USPS updates</span>
                  </div>
                  {letter.liveLetterId && (
                    <a
                      href={`https://dashboard.lob.com/letters/${encodeURIComponent(letter.liveLetterId)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View in Lob
                    </a>
                  )}
                </div>
                <ol className={styles.trackingTimeline}>
                  <li>
                    <span className={styles.timelineDot} />
                    <div>
                      <strong>Submitted to Lob</strong>
                      <span>{formatDateTime(letter.submittedAt)}</span>
                    </div>
                  </li>
                  {(letter.trackingEvents || []).map((event) => (
                    <li key={event.key}>
                      <span
                        className={styles.timelineDot}
                        data-tone={
                          event.status === "delivered"
                            ? "success"
                            : ["failed", "rejected", "returned_to_sender"].includes(
                                  event.status,
                                )
                              ? "danger"
                              : event.status === "re_routed"
                                ? "warning"
                                : "progress"
                        }
                      />
                      <div>
                        <strong>{event.label}</strong>
                        <span>
                          {formatDateTime(event.occurredAt)}
                          {event.location ? ` · ${event.location}` : ""}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className={styles.addressGrid}>
                <div className={styles.addressCard}>
                  <span>Mail to</span>
                  <pre>{formatAddress(letter.recipient)}</pre>
                </div>
                <div className={styles.addressCard}>
                  <span>Return address</span>
                  <pre>{formatAddress(letter.returnAddress)}</pre>
                </div>
              </div>

              {letter.renderedHtml && (
                <div className={styles.sentPreview}>
                  <div className={styles.sentPreviewHeader}>
                    <strong>Exact submitted letter</strong>
                    <span>Stored with this CRM record</span>
                  </div>
                  <iframe
                    title={`Letter to ${letter.recipient?.name || "recipient"}`}
                    srcDoc={letter.renderedHtml}
                    sandbox=""
                  />
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
