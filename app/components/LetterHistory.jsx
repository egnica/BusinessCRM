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

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
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
        <button type="button" onClick={loadHistory} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {message && <p className={styles.historyStatus}>{message}</p>}

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
              <span className={styles.statusBadge}>
                {letter.lobStatus || "Submitted"}
              </span>
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
