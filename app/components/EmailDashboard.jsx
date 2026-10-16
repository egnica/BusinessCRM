"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "../page.module.css";

const formatDateTime = (value) => {
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
};

export default function EmailDashboard({ refreshKey = 0 }) {
  const [sends, setSends] = useState([]);
  const [expandedId, setExpandedId] = useState("");
  const [details, setDetails] = useState({});
  const [detailLoadingId, setDetailLoadingId] = useState("");
  const [detailErrors, setDetailErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/newsletters/history", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load email history.");
      setSends(data.sends || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load email history.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadDetails = useCallback(async (id) => {
    setDetailLoadingId(id);
    setDetails((current) => ({ ...current, [id]: null }));
    setDetailErrors((current) => ({ ...current, [id]: "" }));

    try {
      const res = await fetch("/api/newsletters/history/" + encodeURIComponent(id), {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load recipients.");
      setDetails((current) => ({ ...current, [id]: data }));
    } catch (loadError) {
      setDetailErrors((current) => ({
        ...current,
        [id]: loadError.message || "Could not load recipients.",
      }));
    } finally {
      setDetailLoadingId((current) => current === id ? "" : current);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, refreshKey]);

  function toggleSend(id) {
    if (expandedId === id) {
      setExpandedId("");
      return;
    }
    setExpandedId(id);
    void loadDetails(id);
  }

  function handleRefresh() {
    void loadHistory();
    if (expandedId) void loadDetails(expandedId);
  }

  return (
    <section className={styles.emailDashboard}>
      <div className={styles.emailDashboardHeader}>
        <div>
          <p className={styles.eyebrow}>Campaign activity</p>
          <h2>Email history</h2>
        </div>
        <div className={styles.emailDashboardActions}>
          <span className={styles.resultCount}>{sends.length} sends</span>
          <button
            type="button"
            className={styles.emailHistoryRefreshButton}
            onClick={handleRefresh}
            disabled={refreshing || Boolean(detailLoadingId)}
          >
            {refreshing || detailLoadingId ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <p className={styles.emailHistoryError} role="alert">{error}</p>}

      {loading ? (
        <p className={styles.emailDashboardEmpty}>Loading email history...</p>
      ) : sends.length === 0 && !error ? (
        <p className={styles.emailDashboardEmpty}>
          No campaign sends yet. Your first send will appear here.
        </p>
      ) : sends.length > 0 ? (
        <div className={styles.emailHistoryTable}>
          <div className={styles.emailHistoryHeader}>
            <span>Date sent</span>
            <span>Subject</span>
            <span>Template</span>
            <span>Sent</span>
            <span>Opened</span>
            <span>Clicked</span>
            <span>Failures</span>
            <span>Unsubscribes</span>
          </div>

          {sends.map((send) => {
            const id = String(send._id);
            const isOpen = expandedId === id;
            const detail = details[id];
            return (
              <div className={styles.emailHistoryGroup} key={id}>
                <button
                  type="button"
                  className={styles.emailHistoryRow}
                  onClick={() => toggleSend(id)}
                  aria-expanded={isOpen}
                >
                  <span>{formatDateTime(send.sentAt)}</span>
                  <strong>{send.subject || "—"}</strong>
                  <span>{send.templateName || send.templateId || "—"}</span>
                  <span>{send.sentCount ?? 0}</span>
                  <span className={styles.emailHistoryOpened}>{send.openedCount ?? 0}</span>
                  <span className={styles.emailHistoryClicked}>{send.clickedCount ?? 0}</span>
                  <span>{send.failedCount ?? 0}</span>
                  <span>{send.unsubscribeCount ?? 0}</span>
                </button>

                {isOpen && (
                  <div className={styles.emailHistoryChildren}>
                    {!detail ? (
                      <p role={detailErrors[id] ? "alert" : undefined}>
                        {detailErrors[id] || "Loading current recipient activity…"}
                      </p>
                    ) : (
                      <>
                        <div className={styles.emailHistoryMeta}>
                          <span><strong>Template:</strong> {detail.send?.templateName || "—"}</span>
                          <span><strong>Subject:</strong> {detail.send?.subject || "—"}</span>
                          <span><strong>Sent:</strong> {formatDateTime(detail.send?.sentAt)}</span>
                        </div>

                        <div className={styles.emailRecipientTable}>
                          <div className={styles.emailRecipientHeader}>
                            <span>Recipient</span>
                            <span>Email</span>
                            <span>Status</span>
                          </div>

                          {(detail.recipients || []).map((recipient) => (
                            <div className={styles.emailRecipientRow} key={String(recipient._id)}>
                              {recipient.contactId ? (
                                <a
                                  className={styles.emailRecipientContact}
                                  href={"/?contactId=" + encodeURIComponent(String(recipient.contactId))}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open CRM contact in a new tab"
                                >
                                  {recipient.recipientName || recipient.email || "View contact"} ↗
                                </a>
                              ) : (
                                <span>{recipient.recipientName || "—"}</span>
                              )}
                              <span>{recipient.email}</span>
                              <span
                                className={[
                                  styles.deliveryBadge,
                                  styles["delivery_" + (recipient.status || "sent")] || "",
                                ].join(" ")}
                                title={[
                                  recipient.openedAt ? "Opened: " + formatDateTime(recipient.openedAt) : "",
                                  recipient.clickedAt ? "Clicked: " + formatDateTime(recipient.clickedAt) : "",
                                ].filter(Boolean).join(" | ") || undefined}
                              >
                                {recipient.status || "sent"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
