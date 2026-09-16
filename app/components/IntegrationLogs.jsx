"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import pageStyles from "../page.module.css";
import workspaceStyles from "./CommunicationWorkspace.module.css";
import styles from "./IntegrationLogs.module.css";

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
    second: "2-digit",
  });
}

function eventLabel(value) {
  return String(value || "Event")
    .replace(/^letter\./, "")
    .replace(/^email\./, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function eventTone(value) {
  const eventType = String(value || "").toLowerCase();

  if (/delivered|opened|clicked/.test(eventType)) return "success";
  if (/failed|rejected|returned|bounced|complained|suppressed/.test(eventType)) {
    return "danger";
  }
  if (/delayed|re-routed|rerouted/.test(eventType)) return "warning";
  return "progress";
}

export default function IntegrationLogs() {
  const [activeProvider, setActiveProvider] = useState("lob");
  const [logs, setLogs] = useState({ lob: [], resend: [] });
  const [totals, setTotals] = useState({ lob: 0, resend: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/integration-logs?limit=200", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not load integration logs.");
      }

      setLogs({ lob: data.lob || [], resend: data.resend || [] });
      setTotals(data.totals || { lob: 0, resend: 0 });
    } catch (loadError) {
      setError(loadError.message || "Could not load integration logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const visibleLogs = logs[activeProvider] || [];
  const latestActivity = useMemo(() => {
    const dates = [...logs.lob, ...logs.resend]
      .map((event) => new Date(event.receivedAt || event.occurredAt).getTime())
      .filter(Number.isFinite);
    return dates.length ? new Date(Math.max(...dates)) : null;
  }, [logs]);

  return (
    <main className={pageStyles.pageShell}>
      <section className={workspaceStyles.workspaceHeader}>
        <div>
          <Link className={workspaceStyles.backLink} href="/">
            ← Back to CRM
          </Link>
          <p className={workspaceStyles.eyebrow}>Integration activity</p>
          <h1>Webhook Logs</h1>
          <p>
            Review delivery events received from Lob and Resend without leaving
            the CRM.
          </p>
        </div>

        <nav
          className={workspaceStyles.workspaceLinks}
          aria-label="Communication tools"
        >
          <Link className={workspaceStyles.workspaceLink} href="/letters">
            Letters
          </Link>
          <Link className={workspaceStyles.workspaceLink} href="/email">
            Email
          </Link>
          <span className={workspaceStyles.workspaceLinkActive}>Logs</span>
        </nav>
      </section>

      <section className={styles.summaryGrid} aria-label="Webhook summary">
        <div className={styles.summaryCard}>
          <span>Lob events</span>
          <strong>{totals.lob}</strong>
          <small>Letter webhook updates received</small>
        </div>
        <div className={styles.summaryCard}>
          <span>Resend events</span>
          <strong>{totals.resend}</strong>
          <small>Email delivery and engagement updates</small>
        </div>
        <div className={styles.summaryCard}>
          <span>Latest activity</span>
          <strong className={styles.latestValue}>
            {latestActivity ? formatDateTime(latestActivity) : "No events yet"}
          </strong>
          <small>Most recent event across both services</small>
        </div>
      </section>

      <section className={styles.logsPanel}>
        <div className={styles.logsToolbar}>
          <div>
            <p className={workspaceStyles.eyebrow}>Event history</p>
            <h2>Provider logs</h2>
          </div>
          <button type="button" onClick={loadLogs} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Log provider">
          <button
            type="button"
            role="tab"
            aria-selected={activeProvider === "lob"}
            data-active={activeProvider === "lob"}
            onClick={() => setActiveProvider("lob")}
          >
            Lob <span>{totals.lob}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeProvider === "resend"}
            data-active={activeProvider === "resend"}
            onClick={() => setActiveProvider("resend")}
          >
            Resend <span>{totals.resend}</span>
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {!loading && !error && visibleLogs.length === 0 && (
          <div className={styles.empty}>
            No {activeProvider === "lob" ? "Lob" : "Resend"} webhook events
            have been recorded yet.
          </div>
        )}

        <div className={styles.logList}>
          {visibleLogs.map((event) => (
            <article className={styles.logCard} key={event.id}>
              <div className={styles.logPrimary}>
                <span
                  className={styles.eventBadge}
                  data-tone={eventTone(event.eventType)}
                >
                  {eventLabel(event.eventType)}
                </span>
                <strong>
                  {activeProvider === "lob"
                    ? event.liveLetterId || "Unknown letter"
                    : event.subject || "Untitled email"}
                </strong>
                <small>
                  {activeProvider === "lob"
                    ? `Received ${formatDateTime(event.receivedAt)}`
                    : [event.recipientName, event.recipientEmail]
                        .filter(Boolean)
                        .join(" · ") || "Recipient not recorded"}
                </small>
              </div>

              <div className={styles.logMeta}>
                <span>{formatDateTime(event.occurredAt)}</span>
                {activeProvider === "lob" && event.liveLetterId && (
                  <a
                    href={`https://dashboard.lob.com/letters/${encodeURIComponent(event.liveLetterId)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View in Lob
                  </a>
                )}
                {activeProvider === "resend" && event.resendEmailId && (
                  <code>{event.resendEmailId}</code>
                )}
                {activeProvider === "resend" && event.link && (
                  <a href={event.link} target="_blank" rel="noreferrer">
                    Open clicked link
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
