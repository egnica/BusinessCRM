"use client";

import { useEffect, useMemo, useState } from "react";
import HtmlCodeEditor from "./HtmlCodeEditor";
import styles from "./HtmlEmailModal.module.css";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createToken() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function initialBody(contact) {
  const name = escapeHtml(contact?.firstName || "there");

  return `<p style="margin:0 0 18px;">Hi ${name},</p>

<p style="margin:0 0 16px;"></p>

<p style="margin:0;">Thanks,<br />Nicholas</p>`;
}

export default function HtmlEmailModal({ contact, onClose, onSent }) {
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [bodyHtml, setBodyHtml] = useState(() => initialBody(contact));
  const [previewHtml, setPreviewHtml] = useState("");
  const [activeTab, setActiveTab] = useState("html");
  const [previewDirty, setPreviewDirty] = useState(true);
  const [testEmail, setTestEmail] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [sendToken] = useState(createToken);
  const [config, setConfig] = useState({
    loading: true,
    from: "",
    resendConfigured: false,
    configured: false,
    webhookConfigured: false,
  });

  const displayName = useMemo(() => {
    const personName = [contact?.firstName, contact?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return (
      contact?.ownerNameRaw ||
      personName ||
      contact?.company?.name ||
      "this contact"
    );
  }, [contact]);

  useEffect(() => {
    const savedTestEmail = window.localStorage.getItem("newsletterTestEmail");
    if (savedTestEmail) setTestEmail(savedTestEmail);

    let active = true;

    async function loadSetup() {
      try {
        const res = await fetch(
          `/api/contacts/${contact._id}/html-email?limit=0`,
          { cache: "no-store" },
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Could not load email setup.");
        }

        if (active) {
          setConfig({
            loading: false,
            from: data.from || "",
            resendConfigured: Boolean(data.resendConfigured),
            configured: Boolean(data.configured),
            webhookConfigured: Boolean(data.webhookConfigured),
          });
        }
      } catch (error) {
        if (active) {
          setConfig((current) => ({ ...current, loading: false }));
          setStatus(error.message || "Could not load email setup.");
        }
      }
    }

    loadSetup();

    return () => {
      active = false;
    };
  }, [contact._id]);

  async function renderPreview() {
    setWorking(true);
    setStatus("");

    try {
      const res = await fetch(`/api/contacts/${contact._id}/html-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          subject,
          preheader,
          bodyHtml,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Preview failed.");
      }

      setPreviewHtml(data.html || "");
      setPreviewDirty(false);
      return true;
    } catch (error) {
      setStatus(error.message || "Preview failed.");
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function handleTabChange(tab) {
    setActiveTab(tab);

    if (tab === "preview" && (previewDirty || !previewHtml)) {
      await renderPreview();
    }
  }

  function markPreviewDirty(setter) {
    return (value) => {
      setter(value);
      setPreviewDirty(true);
    };
  }

  async function handleTestSend() {
    if (!config.resendConfigured) {
      setStatus("Resend is not configured yet.");
      return;
    }

    if (!subject.trim()) {
      setStatus("Add a subject before sending a test.");
      return;
    }

    if (!testEmail.trim()) {
      setStatus("Enter your test email address first.");
      return;
    }

    window.localStorage.setItem("newsletterTestEmail", testEmail.trim());
    setWorking(true);
    setStatus("");

    try {
      const res = await fetch(`/api/contacts/${contact._id}/html-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          subject,
          preheader,
          bodyHtml,
          testEmail: testEmail.trim(),
          sendToken: createToken(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Test email failed.");
      }

      setStatus(`Test email sent to ${testEmail.trim()}.`);
    } catch (error) {
      setStatus(error.message || "Test email failed.");
    } finally {
      setWorking(false);
    }
  }

  async function handleSend() {
    if (!config.configured) {
      setStatus("Email sending is not fully configured yet.");
      return;
    }

    if (!subject.trim()) {
      setStatus("Add a subject before sending.");
      return;
    }

    const confirmed = window.confirm(
      `Send "${subject.trim()}" to ${displayName} at ${contact.email}?`,
    );

    if (!confirmed) return;

    setWorking(true);
    setStatus("");

    try {
      const res = await fetch(`/api/contacts/${contact._id}/html-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          subject,
          preheader,
          bodyHtml,
          sendToken,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "HTML email failed.");
      }

      onSent?.(data.latestHtmlEmail);
    } catch (error) {
      setStatus(error.message || "HTML email failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div
        className={styles.backdrop}
        onClick={working ? undefined : onClose}
        aria-hidden="true"
      />

      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="html-email-title"
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>One-to-one outreach</p>
            <h2 id="html-email-title">HTML Email</h2>
            <p className={styles.subhead}>
              Write the body here. The branded email shell and footer are added automatically.
            </p>
          </div>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={working}
          >
            Close
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.metaGrid}>
            <div className={styles.metaCard}>
              <span>To</span>
              <strong>{displayName}</strong>
              <small>{contact.email || "No email"}</small>
            </div>
            <div className={styles.metaCard}>
              <span>From</span>
              <strong>{config.from || "Loading sender…"}</strong>
              <small>
                {config.webhookConfigured
                  ? "Delivery tracking configured"
                  : "Tracking needs webhook setup"}
              </small>
            </div>
          </div>

          <div className={styles.fieldsGrid}>
            <label className={styles.field}>
              <span>Subject</span>
              <input
                value={subject}
                onChange={(event) => {
                  setSubject(event.target.value);
                  setPreviewDirty(true);
                }}
                placeholder="Email subject"
                maxLength={250}
                disabled={working}
              />
            </label>

            <label className={styles.field}>
              <span>Preheader <small>optional</small></span>
              <input
                value={preheader}
                onChange={(event) => {
                  setPreheader(event.target.value);
                  setPreviewDirty(true);
                }}
                placeholder="Short inbox preview text"
                maxLength={300}
                disabled={working}
              />
            </label>
          </div>

          <div className={styles.tabRow}>
            <div className={styles.tabs} role="tablist" aria-label="Email editor view">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "html"}
                className={activeTab === "html" ? styles.activeTab : ""}
                onClick={() => handleTabChange("html")}
                disabled={working}
              >
                HTML
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "preview"}
                className={activeTab === "preview" ? styles.activeTab : ""}
                onClick={() => handleTabChange("preview")}
                disabled={working}
              >
                Preview
              </button>
            </div>

            {activeTab === "preview" && previewDirty && (
              <button
                type="button"
                className={styles.refreshButton}
                onClick={renderPreview}
                disabled={working}
              >
                Refresh Preview
              </button>
            )}
          </div>

          <div className={styles.editorArea}>
            {activeTab === "html" ? (
              <HtmlCodeEditor
                value={bodyHtml}
                onChange={markPreviewDirty(setBodyHtml)}
                placeholder="Write the body HTML for this contact..."
                disabled={working}
              />
            ) : previewHtml ? (
              <iframe
                title="HTML email preview"
                srcDoc={previewHtml}
                className={styles.previewFrame}
                sandbox=""
              />
            ) : (
              <div className={styles.previewEmpty}>
                {working ? "Rendering preview…" : "Preview is not available yet."}
              </div>
            )}
          </div>

          {status && <p className={styles.status}>{status}</p>}

          <div className={styles.testBar}>
            <label className={styles.testField}>
              <span>Test recipient (you)</span>
              <input
                type="email"
                value={testEmail}
                onChange={(event) => setTestEmail(event.target.value)}
                placeholder="your@email.com"
                disabled={working}
              />
            </label>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleTestSend}
              disabled={working || config.loading}
            >
              {working ? "Working…" : "Send Test to Myself"}
            </button>
          </div>
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={working}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSend}
            disabled={
              working ||
              config.loading ||
              !contact.email ||
              contact.emailStatus !== "subscribed"
            }
          >
            {working ? "Sending…" : "Send to Contact"}
          </button>
        </footer>
      </section>
    </>
  );
}
