"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ContactEmailActivity.module.css";

const SOURCE_LABELS = {
  intro: "Introduction",
  campaign: "Campaign",
  "template-test": "Template Test",
  "html-test": "HTML Test",
  manual: "Manual HTML",
  contact: "Contact HTML",
};

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

function formatDateTime(value, includeSeconds = false) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  });
}

function sourceLabel(email) {
  const source = email.source || (email.contactId ? "contact" : "manual");
  return SOURCE_LABELS[source] || source || "Email";
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

function classifyEngagement(email) {
  const clicks = (email.events || []).filter(e => e.type === "email.clicked" && e.link)
    .map(e => ({ time: Date.parse(e.at), link: e.link }))
    .filter(e => Number.isFinite(e.time)).sort((a,b) => a.time-b.time);
  const delivered = Date.parse(email.eventTimestamps?.deliveredAt || email.sentAt || email.createdAt);
  let burst = null;
  for (const click of clicks) {
    if (!Number.isFinite(delivered) || click.time < delivered-30000 || click.time > delivered+120000) continue;
    const batch = clicks.filter(e => e.time >= click.time && e.time <= click.time+30000);
    const unique = new Set(batch.map(e => e.link)).size;
    if (unique >= 3) { burst = { end: Math.max(...batch.map(e => e.time)), unique }; break; }
  }
  if (!burst) return null;
  const later = clicks.filter(e => e.time > burst.end+300000);
  const humanLike = later.length > 0;
  return {
    label: humanLike ? "Later Engagement" : "Bot Likely",
    suspected: !humanLike,
    explanation: humanLike
      ? "An automated-looking click burst was followed by a link click more than five minutes later. Human engagement is possible, but not verified."
      : `${burst.unique} distinct links were requested within 30 seconds shortly after delivery. This suggests automated security scanning.`,
  };
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
        {emails.map((email) => {
          const engagement = classifyEngagement(email);
          return (
          <details className={styles.emailCard} key={email._id}>
            <summary>
              <div className={styles.summaryCopy}>
                <strong>{email.subject || "Untitled email"}</strong>
                <span>
                  {!contactId && (
                    <>
                      {email.recipientName}
                      {email.contactId && (
                        <>
                          {email.recipientName ? " · " : ""}
                          <a
                            className={styles.contactLink}
                            href={`/?contactId=${encodeURIComponent(email.contactId)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`View contact for ${email.recipientName || email.recipientEmail || "this recipient"} (opens in a new tab)`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            View contact →
                          </a>
                        </>
                      )}
                      {email.recipientEmail && (
                        <>
                          {email.recipientName || email.contactId ? " · " : ""}
                          {email.recipientEmail}
                        </>
                      )}
                    </>
                  )}
                  {!contactId &&
                  (email.recipientName || email.recipientEmail || email.contactId)
                    ? " · "
                    : ""}
                  {sourceLabel(email)} · {formatDateTime(email.sentAt || email.createdAt)}
                </span>
              </div>
              <span className={styles.badgeGroup}>
                {engagement && <span className={styles.engagementBadge} data-suspected={engagement.suspected} title={engagement.explanation}>{engagement.label}</span>}
              <span
                className={styles.statusBadge}
                data-status={email.status || "sent"}
              >
                {STATUS_LABELS[email.status] || email.status || "Sent"}
              </span>
              </span>
            </summary>

            <div className={styles.detailsBody}>
              {engagement && <p className={styles.engagementNote}><strong>{engagement.label}:</strong> {engagement.explanation}</p>}
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
                      <div
                        className={styles.clickRow}
                        key={`${event.id || event.at}-${index}`}
                      >
                        <time className={styles.clickTime} dateTime={event.at || undefined}>
                          {formatDateTime(event.at, true) || "Time unavailable"}
                        </time>
                        <a
                          href={event.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {event.link}
                        </a>
                      </div>
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
          );
        })}
      </div>
    </div>
  );
}

