"use client";

import { useEffect, useState } from "react";
import styles from "./EmailHub.module.css";

export default function EmailTemplateTester({ templates, config, loading }) {
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("newsletterTestEmail");
    if (saved) setTestEmail(saved);
  }, []);

  useEffect(() => {
    if (!templateId && templates[0]) {
      setTemplateId(templates[0].id);
      setSubject(templates[0].subject || "");
    }
  }, [templateId, templates]);

  function handleTemplateChange(value) {
    setTemplateId(value);
    setPreviewHtml("");
    setStatus("");
    const template = templates.find((item) => item.id === value);
    if (template) setSubject(template.subject || "");
  }

  async function handlePreview() {
    if (!templateId) return;
    setWorking(true);
    setStatus("");

    try {
      const res = await fetch("/api/newsletters/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Preview failed.");
      setPreviewHtml(data.html || "");
    } catch (error) {
      setStatus(error.message || "Preview failed.");
    } finally {
      setWorking(false);
    }
  }

  async function handleSendTest() {
    if (!config.resendConfigured) {
      setStatus("Resend is not configured yet.");
      return;
    }
    if (!testEmail.trim()) {
      setStatus("Enter the email address that should receive the test.");
      return;
    }
    if (!templateId) {
      setStatus("Choose a template first.");
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

      if (!res.ok) throw new Error(data.error || "Test email failed.");
      setStatus(`Test email sent to ${testEmail.trim()}.`);
    } catch (error) {
      setStatus(error.message || "Test email failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.testLayout}>
      <div className={styles.testControls}>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Template</span>
            <select
              value={templateId}
              onChange={(event) => handleTemplateChange(event.target.value)}
              disabled={working || templates.length === 0}
            >
              {templates.map((template) => (
                <option value={template.id} key={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Send test to</span>
            <input
              type="email"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
              placeholder="your@email.com"
              disabled={working}
            />
          </label>

          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span>Subject</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Email subject"
              maxLength={250}
              disabled={working}
            />
          </label>
        </div>

        <div className={styles.senderStatus}>
          <div>
            <span>From</span>
            <strong>{config.fromEmail || "Sender not detected"}</strong>
          </div>
          <span
            className={`${styles.statusPill} ${
              config.resendConfigured ? styles.statusReady : styles.statusWarning
            }`}
          >
            {config.loading
              ? "Checking setup"
              : config.resendConfigured
                ? "Resend ready"
                : "Needs setup"}
          </span>
        </div>

        <p className={styles.helperText}>
          Test sends use the exact registered template and are marked with
          <strong> [TEST]</strong> in the subject line.
        </p>

        <div className={styles.actionRow}>
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
            onClick={handleSendTest}
            disabled={working || loading || !templateId || !config.resendConfigured}
          >
            {working ? "Working…" : "Send Test Email"}
          </button>
        </div>

        {status && <p className={styles.statusMessage}>{status}</p>}
      </div>

      <div className={styles.testPreviewShell}>
        {previewHtml ? (
          <iframe
            title="Email template preview"
            srcDoc={previewHtml}
            sandbox=""
          />
        ) : (
          <div className={styles.previewPlaceholder}>
            <strong>Template preview</strong>
            <span>Choose Preview to render the current template here.</span>
          </div>
        )}
      </div>
    </div>
  );
}
