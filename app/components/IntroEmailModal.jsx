"use client";

import { useEffect, useState } from "react";
import styles from "../page.module.css";

export default function IntroEmailModal({ contact, onClose, onSent }) {
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - root.clientWidth;

    // Preserve the contact list's position and width while the dialog is open.
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbarWidth}px`;
    }
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      setStatus("");

      try {
        const res = await fetch(
          `/api/contacts/${contact._id}/intro-email`,
          { cache: "no-store" },
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Could not load introduction email.");
        }

        if (active) setPreview(data);
      } catch (error) {
        if (active) {
          setStatus(error.message || "Could not load introduction email.");
        }
      }
    }

    loadPreview();

    return () => {
      active = false;
    };
  }, [contact._id]);

  async function handleSend() {
    const confirmed = window.confirm(
      `Send the introduction email to ${contact.email}?`,
    );

    if (!confirmed) return;

    setWorking(true);
    setStatus("");

    try {
      const res = await fetch(
        `/api/contacts/${contact._id}/intro-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send" }),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Introduction email failed.");
      }

      onSent?.(data.introEmail);
    } catch (error) {
      setStatus(error.message || "Introduction email failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div
        className={styles.newsletterBackdrop}
        onClick={working ? undefined : onClose}
      />
      <section
        className={styles.introEmailModal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-email-title"
      >
        <div className={styles.newsletterModalHeader}>
          <div>
            <p className={styles.eyebrow}>One-to-one outreach</p>
            <h2 id="intro-email-title">Send introduction</h2>
          </div>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={working}
          >
            Close
          </button>
        </div>

        <div className={styles.introEmailBody}>
          <div className={styles.introEmailMeta}>
            <div>
              <span>To</span>
              <strong>{contact.email || "No email"}</strong>
            </div>
            <div>
              <span>Subject</span>
              <strong>{preview?.subject || "Hello from Nicholas Egner"}</strong>
            </div>
          </div>

          {status && <p className={styles.newsletterStatus}>{status}</p>}

          {!preview && !status && (
            <p className={styles.newsletterStatus}>Loading preview…</p>
          )}

          {preview?.html && (
            <div className={`${styles.newsletterPreview} ${styles.introEmailPreview}`}>
              <div className={styles.newsletterPreviewHeader}>
                <strong>Preview</strong>
                <span>Personalized for {preview.recipientName}</span>
              </div>
              <iframe
                title="Introduction email preview"
                srcDoc={preview.html}
                className={styles.newsletterPreviewFrame}
              />
            </div>
          )}

        </div>

        <div className={`${styles.newsletterActions} ${styles.introEmailActions}`}>
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
              !preview ||
              !contact.email ||
              contact.emailStatus === "unsubscribed"
            }
          >
            {working ? "Sending…" : "Send Intro"}
          </button>
        </div>
      </section>
    </>
  );
}
