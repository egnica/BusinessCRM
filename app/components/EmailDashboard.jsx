"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "../page.module.css";
import NewsletterModal from "./NewsletterModal";

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
  const [recoveryId, setRecoveryId] = useState("");
  const [sends, setSends] = useState([]);
  const [expandedId, setExpandedId] = useState("");
  const [expandedRecipientId, setExpandedRecipientId] = useState("");
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
      setExpandedRecipientId("");
      return;
    }
    setExpandedId(id);
    setExpandedRecipientId("");
    void loadDetails(id);
  }

  function handleRefresh() {
    void loadHistory();
    if (expandedId) void loadDetails(expandedId);
  }

  return (
    <>
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
                  <span>{send.scheduledAt ? <>Scheduled<br />{formatDateTime(send.scheduledAt)}</> : formatDateTime(send.sentAt || send.createdAt)}</span>
                  <strong>{send.subject || "—"}</strong>
                  <span>{send.templateName || send.templateId || "—"}</span>
                  <span>{send.sentCount ?? 0}{send.scheduledCount > 0 && <small> · {send.scheduledCount} queued</small>}</span>
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
                          <span><strong>Status:</strong> {detail.send?.status || "—"}</span>
                          <span><strong>From:</strong> {detail.send?.fromEmail || "—"}</span>
                          <span><strong>{detail.send?.scheduledAt ? "Scheduled:" : "Sent:"}</strong> {formatDateTime(detail.send?.scheduledAt || detail.send?.sentAt)}</span>
                          {detail.send?.deliveryVersion === 2 && <button type="button" className={styles.emailHistoryRefreshButton} onClick={() => setRecoveryId(id)}>View progress / resume</button>}
                        </div>

                        <div className={styles.emailRecipientTable}>
                          <div className={styles.emailRecipientHeader}>
                            <span>Recipient</span>
                            <span>Email</span>
                            <span>Status</span>
                          </div>

                          {(detail.recipients || []).map((recipient) => {
                            const recipientKey = id + ":" + String(recipient._id);
                            const clicks = recipient.clicks || [];
                            const hasClicks = clicks.length > 0 || Boolean(recipient.clickedAt);
                            const linksOpen = expandedRecipientId === recipientKey;
                            return (
                              <div className={styles.emailRecipientGroup} key={recipientKey}>
                                <div className={styles.emailRecipientRow}>
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
                                  <div className={styles.emailRecipientStatus}>
                                    <div className={styles.emailRecipientStatusStack}>
                                      <span
                                        className={[
                                          styles.deliveryBadge,
                                          styles["delivery_" + (recipient.status || "sent")] || "",
                                        ].join(" ")}
                                      >
                                        {recipient.status || "sent"}
                                      </span>
                                      {(recipient.openedAt || recipient.clickedAt) && (
                                        <span className={styles.emailRecipientTimes}>
                                          {recipient.openedAt && <small>Opened: {formatDateTime(recipient.openedAt)}</small>}
                                          {recipient.clickedAt && <small>Clicked: {formatDateTime(recipient.clickedAt)}</small>}
                                        </span>
                                      )}
                                    </div>
                                    {hasClicks && (
                                      <button
                                        type="button"
                                        className={styles.emailRecipientLinksButton}
                                        aria-expanded={linksOpen}
                                        onClick={() => setExpandedRecipientId(linksOpen ? "" : recipientKey)}
                                      >
                                        {linksOpen ? "Hide links" : `View links${clicks.length ? ` (${clicks.length})` : ""}`}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {linksOpen && (
                                  <div className={styles.emailRecipientLinks}>
                                    <strong>Clicked links</strong>
                                    {clicks.length ? clicks.map((click, index) => {
                                      let safeLink = "";
                                      try {
                                        const parsed = new URL(click.link);
                                        if (["http:", "https:"].includes(parsed.protocol)) safeLink = parsed.href;
                                      } catch { /* Older click events may have no usable URL. */ }
                                      return (
                                        <div className={styles.emailRecipientClick} key={index}>
                                          <time dateTime={click.at || undefined}>{formatDateTime(click.at)}</time>
                                          {safeLink ? <a href={safeLink} target="_blank" rel="noopener noreferrer">{click.link}</a> : <span>{click.link || "Link unavailable from tracking event"}</span>}
                                        </div>
                                      );
                                    }) : <p>A click was recorded, but its link was not provided.</p>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
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
    {recoveryId && <NewsletterModal resumeId={recoveryId} onClose={() => setRecoveryId("")} onSent={() => { void loadHistory(); if (expandedId) void loadDetails(expandedId); }} />}
    </>
  );
}
