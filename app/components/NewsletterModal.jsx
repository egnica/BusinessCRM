"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../page.module.css";

export default function NewsletterModal({
  recipientCount,
  onClose,
  onSent,
}) {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("newsletterTestEmail");
    if (saved) setTestEmail(saved);

    async function loadTemplates() {
      try {
        const res = await fetch("/api/newsletters/templates");
        const data = await res.json();
        const loaded = data.templates || [];
        setTemplates(loaded);

        if (loaded[0]) {
          setTemplateId(loaded[0].id);
          setSubject(loaded[0].subject || "");
        }
      } catch {
        setStatus("Could not load email templates.");
      }
    }

    loadTemplates();
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates],
  );

  function handleTemplateChange(value) {
    setTemplateId(value);
    setPreviewHtml("");
    const next = templates.find((template) => template.id === value);
    if (next) setSubject(next.subject || "");
  }

  async function handlePreview() {
    setWorking(true);
    setStatus("");

    try {
      const res = await fetch("/api/newsletters/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Preview failed.");
        return;
      }

      setPreviewHtml(data.html || "");
    } catch {
      setStatus("Preview failed.");
    } finally {
      setWorking(false);
    }
  }

  async function handleTestSend() {
    if (!testEmail.trim()) {
      setStatus("Enter a test recipient email.");
      return;
    }

    window.localStorage.setItem("newsletterTestEmail", testEmail.trim());
    setWorking(true);
    setStatus("");

    try {
      const res = await fetch("/api/newsletters/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          subject,
          email: testEmail.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Test email failed.");
        return;
      }

      setStatus("Test email sent to " + testEmail.trim() + ".");
    } catch {
      setStatus("Test email failed.");
    } finally {
      setWorking(false);
    }
  }

  async function handleSendAll() {
    if (!recipientCount) {
      setStatus("There are no subscribed contacts with email addresses.");
      return;
    }

    const label = subject || selectedTemplate?.subject || "Newsletter";
    const confirmed = window.confirm(
      'Send "' + label + '" to ' + recipientCount + " subscribed contacts?",
    );

    if (!confirmed) return;

    setWorking(true);
    setStatus("");

    try {
      const res = await fetch("/api/newsletters/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          subject,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Newsletter send failed.");
        return;
      }

      setStatus(
        "Send complete: " +
          data.sentCount +
          " sent, " +
          data.failedCount +
          " failed.",
      );
      onSent?.();
    } catch {
      setStatus("Newsletter send failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className={styles.newsletterBackdrop} onClick={onClose} />
      <section
        className={styles.newsletterModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="newsletter-title"
      >
        <div className={styles.newsletterModalHeader}>
          <div>
            <p className={styles.eyebrow}>Bulk email</p>
            <h2 id="newsletter-title">Send newsletter</h2>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className={styles.newsletterModalBody}>
          <label className={styles.newsletterField}>
            <span>Template</span>
            <select
              value={templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              {templates.map((template) => (
                <option value={template.id} key={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.newsletterField}>
            <span>Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </label>

          <div className={styles.newsletterRecipientSummary}>
            <strong>{recipientCount}</strong>
            <span>subscribed contacts with email addresses</span>
          </div>

          <div className={styles.newsletterTestRow}>
            <label className={styles.newsletterField}>
              <span>Test recipient</span>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleTestSend}
              disabled={working || !templateId}
            >
              Send Test
            </button>
          </div>

          <div className={styles.newsletterActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handlePreview}
              disabled={working || !templateId}
            >
              Preview
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSendAll}
              disabled={working || !templateId || recipientCount === 0}
            >
              {working ? "Working..." : "Send to " + recipientCount + " contacts"}
            </button>
          </div>

          {status && <p className={styles.newsletterStatus}>{status}</p>}

          {previewHtml && (
            <div className={styles.newsletterPreview}>
              <div className={styles.newsletterPreviewHeader}>
                <strong>Preview</strong>
                <button
                  type="button"
                  onClick={() => setPreviewHtml("")}
                  className={styles.previewClose}
                >
                  Hide
                </button>
              </div>
              <iframe
                title="Newsletter preview"
                srcDoc={previewHtml}
                className={styles.newsletterPreviewFrame}
              />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
