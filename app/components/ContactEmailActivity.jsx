"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ContactEmailActivity.module.css";

const STATUS_LABELS = {
  sending: "Sending",
  sent: "Sent",
  delayed: "Delayed",
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  bounced: "Bounced",
  failed: "Failed",
  complained: "Complaint",
  suppressed: "Suppressed",
};

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeline(email) {
  const timestamps = email.eventTimestamps || {};
  const items = [
    ["Sent", timestamps.sentAt || email.sentAt],
    ["Delivered", timestamps.deliveredAt],
    ["Opened", timestamps.openedAt],
    ["Clicked", timestamps.clickedAt],
    ["Delayed", timestamps.delayedAt],
    ["Bounced", timestamps.bouncedAt],
    ["Failed", timestamps.failedAt],
    ["Complaint", timestamps.complainedAt],
    ["Suppressed", timestamps.suppressedAt],
  ];

  return items.filter(([, value]) => value);
}

export default function ContactEmailActivity({
  contactId = "",
  refreshKey = 0,
  title = "HTML Email Activity",
  description = "Sent messages and Resend delivery events.",
  emptyMessage = "No custom HTML emails have been sent yet.",
}) {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setStatus("");

    try {
      const endpoint = contactId
        ? `/api/contacts/${contactId}/html-email?limit=20&refresh=${refreshKey}`
        : `/api/html-emails?limit=100&refresh=${refreshKey}`;
      const res = await fetch(endpoint, { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Could not load email activity.");
      }

      setEmails(data.history || []);
    } catch (error) {
      setStatus(error.message || "Could not load email activity.");
    } finally {
      setLoading(false);
    }
  }, [contactId, refreshKey]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className={styles.activity}>
      <div className={styles.toolbar}>
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <button type="button" onClick={loadHistory} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {status && <p className={styles.status}>{status}</p>}

      {!loading && !status && emails.length === 0 && (
        <div className={styles.empty}>{emptyMessage}</div>
      )}

      <div className={styles.list}>
        {emails.map((email) => (
          <details className={styles.emailCard} key={email._id}>
            <summary>
              <div className={styles.summaryCopy}>
                <strong>{email.subject || "Untitled email"}</strong>
                <span>
                  {!contactId &&
                    [email.recipientName, email.recipientEmail]
                      .filter(Boolean)
                      .join(" · ")}
                  {!contactId &&
                  (email.recipientName || email.recipientEmail)
                    ? " · "
                    : ""}
                  {formatDateTime(email.sentAt || email.createdAt)}
                </span>
              </div>
              <span
                className={styles.statusBadge}
                data-status={email.status || "sent"}
              >
                {STATUS_LABELS[email.status] || email.status || "Sent"}
              </span>
            </summary>

            <div className={styles.detailsBody}>
              <div className={styles.metaGrid}>
                <div>
                  <span>To</span>
                  <strong>{email.recipientEmail || "—"}</strong>
                </div>
                <div>
                  <span>From</span>
                  <strong>{email.fromEmail || "—"}</strong>
                </div>
                <div>
                  <span>Resend ID</span>
                  <strong>{email.resendEmailId || "Pending"}</strong>
                </div>
              </div>

              <div className={styles.timeline}>
                {timeline(email).map(([label, value]) => (
                  <div className={styles.timelineItem} key={`${label}-${value}`}>
                    <span>{label}</span>
                    <strong>{formatDateTime(value)}</strong>
                  </div>
                ))}
              </div>

              {(email.events || []).some((event) => event.link) && (
                <div className={styles.clicks}>
                  <span>Clicked links</span>
                  {(email.events || [])
                    .filter((event) => event.link)
                    .map((event, index) => (
                      <a
                        href={event.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        key={`${event.id || event.at}-${index}`}
                      >
                        {event.link}
                      </a>
                    ))}
                </div>
              )}

              {email.renderedHtml && (
                <div className={styles.sentPreview}>
                  <div className={styles.sentPreviewHeader}>
                    <strong>Exact sent email</strong>
                    <span>Stored with this CRM record</span>
                  </div>
                  <iframe
                    title={`Sent email: ${email.subject || "HTML email"}`}
                    srcDoc={email.renderedHtml}
                    sandbox=""
                  />
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
