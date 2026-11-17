"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useModalScrollLock from "./useModalScrollLock";
import { NEWSLETTER_DRAFT_KEY, readNewsletterDraft, writeNewsletterDraft, newsletterSchedule } from "@/lib/newsletterWorkflow.mjs";
import styles from "../page.module.css";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(url, body) {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "Request failed. Retry connection."), { status: response.status });
  return data;
}
function emptyDraft() {
  return { requestId: crypto.randomUUID(), templateId: "", subject: "", fromEmail: "nick@nicholasegner.com", excludedIds: [],
    previewContactId: "", testEmail: "", deliveryMode: "now", localTime: "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago", sendId: "", submittedBody: null };
}

export default function NewsletterModal({ onClose, onSent, resumeId = "" }) {
  const [draft, setDraft] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [config, setConfig] = useState({ loading: true, configured: false });
  const [audience, setAudience] = useState({ recipients: [], revision: "" });
  const [loading, setLoading] = useState(true);
  const [storageWarning, setStorageWarning] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [activeView, setActiveView] = useState("details");
  const [previewHtml, setPreviewHtml] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [progress, setProgress] = useState(null);
  const busy = useRef(false);
  const pauseRequested = useRef(false);
  const storageKey = resumeId ? `${NEWSLETTER_DRAFT_KEY}:${resumeId}` : NEWSLETTER_DRAFT_KEY;
  useModalScrollLock();

  function save(value) {
    try {
      if (resumeId) window.localStorage.setItem(storageKey, JSON.stringify(value));
      else writeNewsletterDraft(window.localStorage, value);
    } catch { setStorageWarning("Draft saving is unavailable in this browser. Keep this window open; started sends can also be resumed from Email history."); }
  }
  function change(patch) {
    setDraft((current) => {
      const next = { ...current, ...patch };
      save(next);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let saved;
        try { saved = resumeId ? JSON.parse(window.localStorage.getItem(storageKey) || "null") : readNewsletterDraft(window.localStorage); }
        catch { setStorageWarning("Could not restore a saved draft. Draft saving may be unavailable in this browser."); }
        const next = { ...emptyDraft(), ...(saved || {}), ...(resumeId ? { sendId: resumeId } : {}) };
        if (!Array.isArray(next.excludedIds)) next.excludedIds = [];
        // Save identity immediately so another tab/reopen shares this draft.
        try { window.localStorage.setItem(storageKey, JSON.stringify(next)); }
        catch { setStorageWarning("Draft saving is unavailable in this browser. Keep this window open; started sends can also be resumed from Email history."); }
        const [templateData, setup, recipients] = await Promise.all([
          request("/api/newsletters/templates"), request("/api/newsletters/status"), request("/api/newsletters/recipients"),
        ]);
        if (cancelled) return;
        setTemplates(templateData.templates || []);
        setConfig({ ...setup, loading: false });
        setAudience(recipients);
        const template = templateData.templates.find((item) => item.id === next.templateId) || templateData.templates[0];
        if (!next.templateId && template) { next.templateId = template.id; next.subject = template.subject; }
        if (!setup.senderOptions?.includes(next.fromEmail)) next.fromEmail = setup.defaultFromEmail;
        if (next.sendId) {
          const send = await request(`/api/newsletters/deliveries/${next.sendId}`);
          if (cancelled) return;
          setProgress(send);
          Object.assign(next, { templateId: send.templateId, subject: send.subject, fromEmail: send.fromEmail,
            deliveryMode: send.scheduledAt ? "later" : "now", localTime: send.localTime || "", timeZone: send.timeZone || next.timeZone });
        }
        setDraft(next);
        try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Warning shown above. */ }
      } catch (error) { if (!cancelled) setStatus(error.message); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [resumeId, storageKey]);

  const frozen = Boolean(draft?.submittedBody || draft?.sendId);
  const selected = useMemo(() => audience.recipients.filter((r) => r.eligible && !draft?.excludedIds.includes(r.id)), [audience, draft]);
  const missingTracking = selected.filter((r) => !r.trackingId).length;
  const previewContact = audience.recipients.find((r) => r.id === draft?.previewContactId);
  const displayedRecipients = frozen && progress?.recipients ? progress.recipients : audience.recipients;
  const filtered = useMemo(() => displayedRecipients.filter((r) => `${r.name} ${r.company} ${r.email} ${r.reason}`.toLowerCase().includes(search.toLowerCase())), [displayedRecipients, search]);
  const scheduled = useMemo(() => {
    if (!draft || draft.deliveryMode !== "later" || frozen) return { at: progress?.scheduledAt || "", error: "" };
    try {
      if (!draft.localTime) return { at: "", error: "Choose a delivery date and time." };
      return { at: newsletterSchedule(draft.localTime, draft.timeZone), error: "" };
    } catch (error) { return { at: "", error: error.message }; }
  }, [draft, frozen, progress?.scheduledAt]);

  async function run(action) {
    if (busy.current) return;
    busy.current = true; setWorking(true); setStatus("");
    try { await action(); }
    catch (error) { setStatus(error.message || "Connection interrupted. Resume the same send to recover safely."); }
    finally { busy.current = false; setWorking(false); }
  }
  async function refreshRecipients() {
    await run(async () => { setAudience(await request("/api/newsletters/recipients")); setStatus("Recipient list refreshed. Review the final count before sending."); });
  }
  async function preview() {
    await run(async () => {
      const result = await request("/api/newsletters/preview", { templateId: draft.templateId, subject: draft.subject, trackingId: previewContact?.trackingId || "" });
      setPreviewHtml(result.html || ""); setActiveView("preview");
    });
  }
  async function sendTest() {
    await run(async () => {
      if (!draft.testEmail.trim()) throw new Error("Enter your test recipient address.");
      await request("/api/newsletters/test", { templateId: draft.templateId, subject: draft.subject, email: draft.testEmail.trim(),
        fromEmail: draft.fromEmail, trackingId: previewContact?.trackingId || "" });
      setStatus(`Test sent only to ${draft.testEmail.trim()}${previewContact ? `, personalized as ${previewContact.name}` : ""}.`);
    });
  }
  async function continueSend(id, retryFailed = false) {
    pauseRequested.current = false;
    let next;
    let attempts = 0;
    do {
      next = await request(`/api/newsletters/deliveries/${id}`, { retryFailed });
      retryFailed = false;
      setProgress(next);
      if (next.paused) { setStatus("Delivery could not be confirmed. Use Resume to check the same send safely."); break; }
      if (pauseRequested.current) { setStatus("Paused after the current group. Resume here or from Email history."); break; }
      if (next.busy && ++attempts > 90) throw new Error("A previous request is still finishing. Wait a moment, then resume.");
      if (next.pendingCount) await delay(next.busy ? 1500 : 650);
    } while (next.pendingCount);
    onSent?.();
    if (!next.pendingCount) setStatus(next.failedCount ? "Some recipients failed. Retry only the failed group below." : next.reviewCount ? "Some recipients need review in Resend before any further action." : next.scheduledAt ? "Newsletter queued. Resend will deliver it at the scheduled time, even after you close this window." : "Newsletter send complete.");
  }
  async function startSend() {
    if (!draft || busy.current) return;
    if (!frozen) {
      const when = draft.deliveryMode === "later" ? ` for ${new Date(scheduled.at).toLocaleString("en-US", { timeZone: draft.timeZone })} (${draft.timeZone})` : " now";
      if (!window.confirm(`${draft.deliveryMode === "later" ? "Schedule" : "Send"} “${draft.subject}” from ${draft.fromEmail} to ${selected.length} unique recipients${when}?`)) return;
    }
    await run(async () => {
      let id = draft.sendId;
      if (!id) {
        const body = draft.submittedBody || { requestId: draft.requestId, templateId: draft.templateId, subject: draft.subject,
          fromEmail: draft.fromEmail, contactIds: selected.map((r) => r.id), revision: audience.revision,
          localTime: draft.deliveryMode === "later" ? draft.localTime : "", timeZone: draft.timeZone };
        change({ submittedBody: body }); // Persist retry identity before the first request.
        let result;
        try { result = await request("/api/newsletters/deliveries", body); }
        catch (error) {
          if (error.status === 400 || error.status === 503 || (error.status === 409 && error.message.includes("contact list changed"))) change({ submittedBody: null });
          throw error;
        }
        id = result.sendId; change({ sendId: id }); setProgress(result);
      }
      await continueSend(id);
    });
  }
  function newNewsletter() {
    if (frozen && !window.confirm("Start a separate newsletter? Recipients may already have received this one. The existing send remains in Email history.")) return;
    const next = emptyDraft();
    next.templateId = templates[0]?.id || ""; next.subject = templates[0]?.subject || "";
    save(next); setDraft(next); setProgress(null); setPreviewHtml(""); setActiveView("details"); setStatus("");
  }
  const canStart = !loading && draft && config.configured && !working && (frozen || (selected.length > 0 && !missingTracking && !scheduled.error && draft.subject.trim()));
  const timeZones = [...new Set([draft?.timeZone, "America/Chicago", "America/Phoenix", "America/New_York", "America/Denver", "America/Los_Angeles", "UTC", ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [])].filter(Boolean))];

  return <>
    <div className={styles.newsletterBackdrop} onClick={working ? undefined : onClose} />
    <section className={styles.newsletterModal} role="dialog" aria-modal="true" aria-labelledby="newsletter-title">
      <header className={styles.newsletterModalHeader}>
        <div><p className={styles.eyebrow}>Bulk email</p><h2 id="newsletter-title">Send newsletter</h2></div>
        <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={working}>Close</button>
      </header>
      <nav className={styles.newsletterViewTabs} aria-label="Newsletter view">
        {["details", "recipients", "preview"].map((view) => <button key={view} type="button" aria-pressed={activeView === view} disabled={loading || !draft || working}
          onClick={() => view === "preview" ? previewHtml ? setActiveView(view) : preview() : setActiveView(view)}>{view[0].toUpperCase() + view.slice(1)}{view === "recipients" && draft ? ` (${frozen ? progress?.recipientCount ?? selected.length : selected.length})` : ""}</button>)}
      </nav>
      {loading ? <div className={styles.newsletterModalBody}>Loading newsletter…</div> : !draft ? <div className={styles.newsletterModalBody}><p role="alert">{status}</p><button type="button" onClick={() => window.location.reload()}>Retry connection</button></div> : <>
        <div className={styles.newsletterModalBody} hidden={activeView !== "details"}>
          <p className={styles.newsletterHint}>{storageWarning || (frozen ? "This send is saved. Its recipients and content are locked so recovery cannot create a different email." : "Your draft is saved in this browser as you make changes.")}</p>
          <div className={styles.newsletterFormGrid}>
            <label className={styles.newsletterField}><span>Template</span><select value={draft.templateId} disabled={working || frozen} onChange={(e) => {
              const template = templates.find((t) => t.id === e.target.value);
              change({ templateId: e.target.value, subject: template?.subject || "" }); setPreviewHtml("");
            }}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label className={styles.newsletterField}><span>From</span><select value={draft.fromEmail} disabled={working || frozen} onChange={(e) => change({ fromEmail: e.target.value })}>
              {(config.senderOptions || [draft.fromEmail]).map((email) => <option key={email} value={email}>{email}</option>)}</select></label>
          </div>
          <label className={styles.newsletterField}><span>Subject</span><input maxLength={250} value={draft.subject} disabled={working || frozen} onChange={(e) => change({ subject: e.target.value })} /></label>
          <div className={`${styles.newsletterConfigStatus} ${config.configured ? styles.newsletterConfigReady : styles.newsletterConfigNeedsSetup}`}>
            <strong>{config.configured ? "Email setup ready" : "Email setup incomplete"}</strong>
            <span>{config.configured ? `Replies go to ${config.introFromEmail}` : config.setupIssues?.join(" ") || "Check your email setup and redeploy."}</span>
          </div>
          <div className={styles.newsletterRecipientSummary}><strong>{frozen ? progress?.recipientCount ?? selected.length : selected.length}</strong><span>unique recipients</span>
            <button type="button" className={styles.newsletterTextButton} disabled={working} onClick={() => setActiveView("recipients")}>Review recipients</button></div>
          {!frozen && missingTracking > 0 && <p role="alert" className={styles.newsletterHint}>{missingTracking} selected contacts need tracking IDs. Refresh the CRM contacts, then refresh recipients before sending.</p>}
          <label className={styles.newsletterField}><span>Delivery</span><select value={draft.deliveryMode} disabled={working || frozen} onChange={(e) => change({ deliveryMode: e.target.value })}>
            <option value="now">Send now</option><option value="later">Schedule for later</option></select></label>
          {draft.deliveryMode === "later" && <>
            <div className={styles.newsletterFormGrid}>
              <label className={styles.newsletterField}><span>Date and time</span><input type="datetime-local" value={draft.localTime} disabled={working || frozen} onChange={(e) => change({ localTime: e.target.value })} /></label>
              <label className={styles.newsletterField}><span>Timezone</span><select value={draft.timeZone} disabled={working || frozen} onChange={(e) => change({ timeZone: e.target.value })}>{timeZones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label>
            </div>
            <p className={styles.newsletterHint}>{scheduled.error || "Schedule up to 30 days ahead. Keep this window open until all recipients are queued; Resend then handles delivery."}</p>
          </>}
          <label className={styles.newsletterField}><span>Preview and test as</span><select value={draft.previewContactId} disabled={working} onChange={(e) => { change({ previewContactId: e.target.value }); setPreviewHtml(""); }}>
            <option value="">Sample contact (no contact attribution)</option>{audience.recipients.filter((r) => r.trackingId).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.email}</option>)}</select></label>
          <div className={styles.newsletterTestRow}>
            <label className={styles.newsletterField}><span>Send test only to</span><input type="email" value={draft.testEmail} disabled={working} placeholder="you@example.com" onChange={(e) => change({ testEmail: e.target.value })} /></label>
            <button type="button" className={styles.secondaryButton} disabled={working || !draft.templateId || !config.resendConfigured} onClick={sendTest}>Send Test</button>
          </div>
          <p className={styles.newsletterHint}>Tests use the selected contact’s name and website tracking links. The unsubscribe link opens a harmless test page.</p>
          {!frozen && <button type="button" className={styles.newsletterTextButton} disabled={working} onClick={newNewsletter}>Discard draft</button>}
        </div>
        <div className={styles.newsletterModalBody} hidden={activeView !== "recipients"}>
          <div className={styles.newsletterReviewToolbar}>
            <label className={styles.newsletterField}><span>Search recipients or exclusions</span><input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></label>
            <button type="button" className={styles.secondaryButton} disabled={working || frozen} onClick={refreshRecipients}>Refresh recipients</button>
          </div>
          <p className={styles.newsletterHint}>{frozen ? "These are the saved recipients and dispatch results for this send." : `${selected.length} selected. Duplicates, invalid addresses, and contacts who are not subscribed are excluded. Uncheck anyone to leave them out.`}</p>
          {!frozen && <div className={styles.newsletterReviewToolbar}>
            <button type="button" className={styles.newsletterTextButton} disabled={working} onClick={() => change({ excludedIds: [] })}>Include all eligible</button>
            <button type="button" className={styles.newsletterTextButton} disabled={working} onClick={() => change({ excludedIds: audience.recipients.filter((r) => r.eligible).map((r) => r.id) })}>Clear selection</button>
          </div>}
          {filtered.slice(page * 40, (page + 1) * 40).map((r) => <label key={r.id} className={styles.newsletterRecipientRow}>
            <input type="checkbox" checked={frozen ? r.included !== false : r.eligible && !draft.excludedIds.includes(r.id)} disabled={working || frozen || !r.eligible} onChange={(e) => change({ excludedIds: e.target.checked ? draft.excludedIds.filter((id) => id !== r.id) : [...draft.excludedIds, r.id] })} />
            <span><strong>{r.name}</strong><small>{r.email || "No email address"}</small></span><small>{r.reason || (!r.trackingId ? "Needs tracking ID" : draft.excludedIds.includes(r.id) ? "Excluded from this send" : "Included")}</small>
          </label>)}
          {!filtered.length && <p>No matching contacts.</p>}
          <div className={styles.newsletterReviewToolbar}>
            <button type="button" className={styles.secondaryButton} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / 40))}</span>
            <button type="button" className={styles.secondaryButton} disabled={(page + 1) * 40 >= filtered.length} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
        {activeView === "preview" && <div className={styles.newsletterPreviewPane}><iframe title="Newsletter preview" srcDoc={previewHtml} className={styles.newsletterPreviewFrame} sandbox="" /></div>}
      </>}
      <footer className={styles.newsletterFooter}>
        {progress && <div className={styles.newsletterProgress} role="status">
          <progress max={progress.recipientCount || 1} value={progress.sentCount + progress.scheduledCount + progress.failedCount + progress.skippedCount + progress.reviewCount + progress.cancelledCount} />
          <span>{progress.sentCount} sent · {progress.scheduledCount} scheduled · {progress.failedCount} failed · {progress.pendingCount} remaining{progress.skippedCount ? ` · ${progress.skippedCount} skipped` : ""}{progress.cancelledCount ? ` · ${progress.cancelledCount} cancelled` : ""}</span>
          {progress.reviewCount > 0 && <span>{progress.reviewCount} need review. <a href="https://resend.com/emails" target="_blank" rel="noopener noreferrer">Review delivery in Resend</a></span>}
          {progress.errors?.length > 0 && <p>{[...new Set(progress.errors.map((e) => e.message))].join(" ")}</p>}
        </div>}
        {status && <p className={styles.newsletterStatus} role="status">{status}</p>}
        <div className={styles.newsletterActions}>
          {working && progress ? <button type="button" className={styles.secondaryButton} onClick={() => { pauseRequested.current = true; }}>Pause after current group</button> : <>
            {draft && <button type="button" className={styles.secondaryButton} onClick={preview} disabled={working || !draft.templateId}>Preview</button>}
            {progress && !progress.pendingCount && !resumeId && <button type="button" className={styles.secondaryButton} disabled={working} onClick={newNewsletter}>New newsletter</button>}
            {progress?.failedCount > 0 && <button type="button" className={styles.secondaryButton} disabled={working || !config.configured} onClick={() => {
              if (window.confirm(`Retry only ${progress.failedCount} failed recipients? Successful recipients will not receive another email.`)) void run(() => continueSend(draft.sendId, true));
            }}>Retry failed only</button>}
            {(!progress || progress.pendingCount > 0) && <button type="button" className={styles.primaryButton} disabled={!canStart} onClick={startSend}>
              {working ? "Working…" : frozen ? "Resume send" : `${draft?.deliveryMode === "later" ? "Schedule" : "Send to"} ${selected.length} contacts`}
            </button>}
          </>}
        </div>
      </footer>
    </section>
  </>;
}
