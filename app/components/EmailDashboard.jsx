"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";

const formatDateTime = (value) => {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-US", {
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      setLoading(true);

      try {
        const res = await fetch("/api/newsletters/history");
        const data = await res.json();
        setSends(data.sends || []);
      } catch {
        setSends([]);
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [refreshKey]);

  async function toggleSend(id) {
    if (expandedId === id) {
      setExpandedId("");
      return;
    }

    setExpandedId(id);

    if (details[id]) return;

    try {
      const res = await fetch("/api/newsletters/history/" + id);
      const data = await res.json();

      if (res.ok) {
        setDetails((prev) => ({
          ...prev,
          [id]: data,
        }));
      }
    } catch {
      // Parent row remains visible if detail loading fails.
    }
  }

  return (
    <section className={styles.emailDashboard}>
      <div className={styles.emailDashboardHeader}>
        <div>
          <p className={styles.eyebrow}>Newsletter activity</p>
          <h2>Email history</h2>
        </div>
        <span className={styles.resultCount}>{sends.length} sends</span>
      </div>

      {loading ? (
        <p className={styles.emailDashboardEmpty}>Loading email history...</p>
      ) : sends.length === 0 ? (
        <p className={styles.emailDashboardEmpty}>
          No newsletter sends yet. Your first send will appear here.
        </p>
      ) : (
        <div className={styles.emailHistoryTable}>
          <div className={styles.emailHistoryHeader}>
            <span>Date sent</span>
            <span>Subject</span>
            <span>Template</span>
            <span>Sent</span>
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
                  <span>{send.failedCount ?? 0}</span>
                  <span>{send.unsubscribeCount ?? 0}</span>
                </button>

                {isOpen && (
                  <div className={styles.emailHistoryChildren}>
                    {!detail ? (
                      <p>Loading recipients...</p>
                    ) : (
                      <>
                        <div className={styles.emailHistoryMeta}>
                          <span>
                            <strong>Template:</strong>{" "}
                            {detail.send?.templateName || "—"}
                          </span>
                          <span>
                            <strong>Subject:</strong>{" "}
                            {detail.send?.subject || "—"}
                          </span>
                          <span>
                            <strong>Sent:</strong>{" "}
                            {formatDateTime(detail.send?.sentAt)}
                          </span>
                        </div>

                        <div className={styles.emailRecipientTable}>
                          <div className={styles.emailRecipientHeader}>
                            <span>Recipient</span>
                            <span>Email</span>
                            <span>Status</span>
                          </div>

                          {(detail.recipients || []).map((recipient) => (
                            <div
                              className={styles.emailRecipientRow}
                              key={String(recipient._id)}
                            >
                              <span>{recipient.recipientName || "—"}</span>
                              <span>{recipient.email}</span>
                              <span
                                className={
                                  styles.deliveryBadge +
                                  " " +
                                  (styles[
                                    "delivery_" + (recipient.status || "sent")
                                  ] || "")
                                }
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
      )}
    </section>
  );
}
