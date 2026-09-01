"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PROPERTY_LETTER_TEMPLATES,
  getPropertyLetterTemplate,
} from "../data/propertyLetterTemplates";
import styles from "./LetterComposerModal.module.css";

const EMPTY_FROM = {
  name: "",
  address_line1: "",
  address_line2: "",
  address_city: "",
  address_state: "",
  address_zip: "",
  address_country: "US",
};

function parseMailingAddress(prospect) {
  const lines = (prospect?.mailingAddress?.lines || [])
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  let city = "";
  let state = "";
  let zip = "";
  let cityLineIndex = -1;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(
      /^(.*?)[,\s]+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i,
    );

    if (match) {
      city = match[1].replace(/,$/, "").trim();
      state = match[2].toUpperCase();
      zip = match[3];
      cityLineIndex = index;
      break;
    }
  }

  const addressLines =
    cityLineIndex >= 0 ? lines.slice(0, cityLineIndex) : [...lines];

  let streetIndex = addressLines.findIndex((line) =>
    /^\d+[A-Z0-9-]*\s+/i.test(line),
  );

  if (streetIndex < 0 && addressLines.length) {
    streetIndex = addressLines.length - 1;
  }

  const extraNameLines =
    streetIndex > 0 ? addressLines.slice(0, streetIndex) : [];
  const baseName =
    prospect?.mailingContactName ||
    prospect?.mailingAddress?.recipientName ||
    prospect?.ownerNameRaw ||
    "";

  const nameParts = [baseName, ...extraNameLines].filter(
    (value, index, items) =>
      value && items.findIndex((item) => item === value) === index,
  );

  return {
    name: nameParts.join(" / "),
    address_line1: streetIndex >= 0 ? addressLines[streetIndex] || "" : "",
    address_line2:
      streetIndex >= 0 ? addressLines.slice(streetIndex + 1).join(" ") : "",
    address_city: city,
    address_state: state,
    address_zip: zip,
    address_country: "US",
  };
}

function buildLobHtml(bodyHtml) {
  return [
    '<html style="padding-top: 3in; margin: .5in;">',
    bodyHtml.trim(),
    "</html>",
  ].join("");
}

function getProofLabel(status) {
  if (status === "rendered") return "Ready";
  if (status === "failed") return "Failed";
  return "Rendering";
}

function AddressFields({ value, onChange, prefix }) {
  const field = (name) => ({
    value: value[name] || "",
    onChange: (event) => onChange(name, event.target.value),
  });

  return (
    <div className={styles.addressGrid}>
      <label className={styles.fullWidth}>
        <span>Name</span>
        <input type="text" {...field("name")} />
      </label>

      <label className={styles.fullWidth}>
        <span>Address line 1</span>
        <input type="text" {...field("address_line1")} />
      </label>

      <label className={styles.fullWidth}>
        <span>Address line 2</span>
        <input type="text" {...field("address_line2")} />
      </label>

      <label>
        <span>City</span>
        <input type="text" {...field("address_city")} />
      </label>

      <label>
        <span>State</span>
        <input
          type="text"
          maxLength={2}
          aria-label={prefix + " state"}
          {...field("address_state")}
        />
      </label>

      <label>
        <span>ZIP</span>
        <input type="text" {...field("address_zip")} />
      </label>
    </div>
  );
}

export default function LetterComposerModal({ prospect, onClose }) {
  const parsedTo = useMemo(() => parseMailingAddress(prospect), [prospect]);
  const draftKey = useMemo(
    () => (prospect?._id ? `crmLobLetterDraft:${prospect._id}` : ""),
    [prospect?._id],
  );
  const proofKey = useMemo(
    () => (prospect?._id ? `crmLobLetterProof:${prospect._id}` : ""),
    [prospect?._id],
  );
  const templateKey = useMemo(
    () => (prospect?._id ? `crmLobLetterTemplate:${prospect._id}` : ""),
    [prospect?._id],
  );

  const [toAddress, setToAddress] = useState(parsedTo);
  const [fromAddress, setFromAddress] = useState(EMPTY_FROM);
  const [templateId, setTemplateId] = useState("blank");
  const [bodyHtml, setBodyHtml] = useState("");
  const [working, setWorking] = useState(false);
  const [checkingProof, setCheckingProof] = useState(false);
  const [message, setMessage] = useState("");
  const [proof, setProof] = useState(null);

  function persistProof(nextProof) {
    setProof(nextProof);

    if (!proofKey) return;

    try {
      if (nextProof) {
        window.localStorage.setItem(proofKey, JSON.stringify(nextProof));
      } else {
        window.localStorage.removeItem(proofKey);
      }
    } catch {
      // Local persistence is a convenience only.
    }
  }

  useEffect(() => {
    setToAddress(parsedTo);
    setMessage("");

    try {
      const savedDraft = draftKey
        ? window.localStorage.getItem(draftKey)
        : "";
      const savedTemplateId = templateKey
        ? window.localStorage.getItem(templateKey)
        : "";
      const savedProof = proofKey
        ? window.localStorage.getItem(proofKey)
        : "";

      setBodyHtml(savedDraft || "");
      setTemplateId(savedTemplateId || "blank");
      setProof(savedProof ? JSON.parse(savedProof) : null);
    } catch {
      setBodyHtml("");
      setTemplateId("blank");
      setProof(null);
    }
  }, [draftKey, parsedTo, proofKey, prospect?._id, templateKey]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("crmLobReturnAddress");
      if (saved) {
        setFromAddress({ ...EMPTY_FROM, ...JSON.parse(saved) });
      }
    } catch {
      // Ignore invalid browser-local address data.
    }
  }, []);

  useEffect(() => {
    if (
      !proof?.letterId ||
      proof.status === "rendered" ||
      proof.status === "failed"
    ) {
      return undefined;
    }

    let cancelled = false;
    let timeoutId;

    async function pollProof() {
      try {
        const response = await fetch(
          "/api/lob/preview-letter?letterId=" +
            encodeURIComponent(proof.letterId),
          { cache: "no-store" },
        );
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok) {
          setMessage(
            data.details ||
              data.error ||
              "Could not check the mailing proof.",
          );
          timeoutId = window.setTimeout(pollProof, 10000);
          return;
        }

        const nextProof = {
          ...proof,
          ...data,
          lastCheckedAt: new Date().toISOString(),
        };

        persistProof(nextProof);

        if (data.status === "rendered" && data.url) {
          setMessage("Mailing proof ready. Nothing was mailed.");
          return;
        }

        if (data.status === "failed") {
          setMessage(
            data.failureReason ||
              "Lob could not render this mailing proof.",
          );
          return;
        }

        timeoutId = window.setTimeout(pollProof, 5000);
      } catch (error) {
        if (cancelled) return;
        setMessage(
          (error.message || "Could not check the mailing proof.") +
            " The CRM will try again automatically.",
        );
        timeoutId = window.setTimeout(pollProof, 10000);
      }
    }

    timeoutId = window.setTimeout(pollProof, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [proof?.letterId, proof?.status]);

  function updateTo(name, value) {
    setToAddress((current) => ({ ...current, [name]: value }));
  }

  function updateFrom(name, value) {
    setFromAddress((current) => {
      const next = { ...current, [name]: value };

      try {
        window.localStorage.setItem(
          "crmLobReturnAddress",
          JSON.stringify(next),
        );
      } catch {
        // Local persistence is a convenience only.
      }

      return next;
    });
  }

  function updateBodyHtml(value) {
    setBodyHtml(value);
    setMessage("");

    if (!draftKey) return;

    try {
      if (value) {
        window.localStorage.setItem(draftKey, value);
      } else {
        window.localStorage.removeItem(draftKey);
      }
    } catch {
      // Draft persistence is a convenience only.
    }
  }

  function selectTemplate(nextTemplateId) {
    const template = getPropertyLetterTemplate(nextTemplateId);
    setTemplateId(template.id);

    try {
      if (templateKey) {
        window.localStorage.setItem(templateKey, template.id);
      }
    } catch {
      // Template persistence is a convenience only.
    }

    if (!bodyHtml.trim() && template.html) {
      updateBodyHtml(template.html);
    }
  }

  function clearDraft() {
    updateBodyHtml("");
    persistProof(null);
    setMessage("Draft cleared.");
  }

  const trimmedBodyHtml = bodyHtml.trim();
  const finalLobHtml = useMemo(
    () => (trimmedBodyHtml ? buildLobHtml(trimmedBodyHtml) : ""),
    [trimmedBodyHtml],
  );

  const hasRequiredTo = Boolean(
    toAddress.name &&
      toAddress.address_line1 &&
      toAddress.address_city &&
      toAddress.address_state &&
      toAddress.address_zip,
  );

  const hasRequiredFrom = Boolean(
    fromAddress.name &&
      fromAddress.address_line1 &&
      fromAddress.address_city &&
      fromAddress.address_state &&
      fromAddress.address_zip,
  );

  const proofMatchesDraft = Boolean(
    proof?.bodyHtmlSnapshot &&
      proof.bodyHtmlSnapshot === trimmedBodyHtml,
  );

  const proofLabel = getProofLabel(proof?.status);
  const nearHtmlLimit = finalLobHtml.length >= 9000;

  async function checkProofStatus() {
    if (!proof?.letterId) return;

    setCheckingProof(true);
    setMessage("Checking mailing proof…");

    try {
      const response = await fetch(
        "/api/lob/preview-letter?letterId=" +
          encodeURIComponent(proof.letterId),
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.details || data.error || "Could not check the mailing proof.",
        );
      }

      const nextProof = {
        ...proof,
        ...data,
        lastCheckedAt: new Date().toISOString(),
      };

      persistProof(nextProof);

      if (data.status === "rendered" && data.url) {
        setMessage("Mailing proof ready. Nothing was mailed.");
      } else if (data.status === "failed") {
        setMessage(
          data.failureReason || "Lob could not render this mailing proof.",
        );
      } else {
        setMessage("Mailing proof is still rendering.");
      }
    } catch (error) {
      setMessage(error.message || "Could not check the mailing proof.");
    } finally {
      setCheckingProof(false);
    }
  }

  async function generateProof() {
    setMessage("");

    if (!hasRequiredTo) {
      setMessage("Complete the recipient mailing address first.");
      return;
    }

    if (!hasRequiredFrom) {
      setMessage("Complete the return address first.");
      return;
    }

    if (!trimmedBodyHtml) {
      setMessage("Add letter content before generating a proof.");
      return;
    }

    if (finalLobHtml.length > 10000) {
      setMessage("This letter is too large for Lob's inline HTML limit.");
      return;
    }

    setWorking(true);

    try {
      const response = await fetch("/api/lob/preview-letter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prospectId: prospect?._id || "",
          to: toAddress,
          from: fromAddress,
          bodyHtml: trimmedBodyHtml,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.details || data.error || "Could not create the mailing proof.",
        );
      }

      persistProof({
        letterId: data.letterId,
        status: data.status || "processed",
        url: "",
        thumbnails: [],
        bodyHtmlSnapshot: trimmedBodyHtml,
        createdAt: new Date().toISOString(),
        lastCheckedAt: null,
        testMode: true,
      });

      setMessage(
        "Lob accepted the test letter. The mailing proof is rendering and will appear here when ready.",
      );
    } catch (error) {
      setMessage(error.message || "Could not create the mailing proof.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <div className={styles.backdrop} onClick={working ? undefined : onClose} />

      <section className={styles.modal} aria-label="Create property owner letter">
        <header className={styles.header}>
          <div>
            <div className={styles.titleRow}>
              <p className={styles.eyebrow}>Property Owner Outreach</p>
              <span className={styles.testBadge}>Test mode</span>
            </div>
            <h2>Create Letter</h2>
            <p>
              Write the letter, review the page, then generate the actual Lob
              mailing proof before live sending is enabled.
            </p>
          </div>

          <button type="button" onClick={onClose} disabled={working}>
            Close
          </button>
        </header>

        <div className={styles.body}>
          <div className={styles.addressColumns}>
            <section className={styles.card}>
              <div className={styles.cardHeading}>
                <div>
                  <h3>Mail To</h3>
                  <p>From this prospect's saved mailing address.</p>
                </div>
              </div>
              <AddressFields value={toAddress} onChange={updateTo} prefix="To" />
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeading}>
                <div>
                  <h3>Return Address</h3>
                  <p>Remembered on this browser.</p>
                </div>
              </div>
              <AddressFields
                value={fromAddress}
                onChange={updateFrom}
                prefix="From"
              />
            </section>
          </div>

          <div className={styles.composeGrid}>
            <section className={styles.card}>
              <div className={styles.editorHeader}>
                <div>
                  <h3>Write</h3>
                  <p>Your draft saves automatically for this prospect.</p>
                </div>

                <label className={styles.templateField}>
                  <span>Template</span>
                  <select
                    value={templateId}
                    onChange={(event) => selectTemplate(event.target.value)}
                  >
                    {PROPERTY_LETTER_TEMPLATES.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <textarea
                className={styles.htmlEditor}
                value={bodyHtml}
                onChange={(event) => updateBodyHtml(event.target.value)}
                rows={20}
                spellCheck={false}
                placeholder={'<p>Dear Allen and Crystal,</p>\n\n<p>I wanted to reach out...</p>\n\n<p>Best,<br>Nick</p>'}
              />

              <div className={styles.editorFooter}>
                <span>Draft saved automatically</span>
                {nearHtmlLimit && (
                  <span className={styles.warningText}>
                    Approaching Lob's 10,000-character HTML limit
                  </span>
                )}
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={clearDraft}
                  disabled={working || !bodyHtml}
                >
                  Clear
                </button>
              </div>
            </section>

            <section className={styles.previewCard}>
              <div className={styles.cardHeading}>
                <div>
                  <h3>Letter Preview</h3>
                  <p>
                    Lob adds the mailing addresses in the reserved top area.
                  </p>
                </div>
              </div>

              {trimmedBodyHtml ? (
                <iframe
                  className={styles.localPreviewFrame}
                  srcDoc={finalLobHtml}
                  sandbox=""
                  title="Letter preview"
                />
              ) : (
                <div className={styles.emptyPreview}>
                  <strong>Your letter preview will appear here.</strong>
                  <span>Start writing on the left.</span>
                </div>
              )}
            </section>
          </div>

          {proof?.letterId && (
            <section className={styles.proofCard}>
              <div className={styles.proofTopRow}>
                <div>
                  <div className={styles.proofTitleRow}>
                    <h3>Mailing Proof</h3>
                    <span
                      className={
                        proof.status === "rendered"
                          ? styles.statusReady
                          : proof.status === "failed"
                            ? styles.statusFailed
                            : styles.statusRendering
                      }
                    >
                      {proofLabel}
                    </span>
                  </div>

                  <p>
                    {proof.status === "rendered"
                      ? "Lob finished the printable PDF proof."
                      : proof.status === "failed"
                        ? "Lob could not render this proof."
                        : "Lob is preparing the printable PDF. You can close this window and come back later."}
                  </p>

                  {!proofMatchesDraft && (
                    <p className={styles.proofNotice}>
                      Your draft has changed since this proof was created.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={checkProofStatus}
                  disabled={checkingProof || working}
                >
                  {checkingProof ? "Checking…" : "Check Status"}
                </button>
              </div>

              {proof.status === "rendered" && proof.url ? (
                <>
                  <iframe
                    className={styles.proofFrame}
                    src={proof.url + "#zoom=page-width"}
                    title="Lob mailing proof"
                  />
                  <div className={styles.proofActions}>
                    <a href={proof.url} target="_blank" rel="noreferrer">
                      Open PDF in New Tab
                    </a>
                  </div>
                </>
              ) : proof.status === "failed" ? (
                <p className={styles.proofError}>
                  {proof.failureReason || "The proof could not be rendered."}
                </p>
              ) : (
                <div className={styles.renderingState}>
                  <span className={styles.spinner} aria-hidden="true" />
                  <div>
                    <strong>Rendering mailing proof</strong>
                    <span>The CRM is checking Lob automatically.</span>
                  </div>
                </div>
              )}
            </section>
          )}

          {message && <p className={styles.statusMessage}>{message}</p>}
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerNote}>
            <strong>Test mode</strong>
            <span>No physical mail can be sent from this build.</span>
          </div>

          <div className={styles.footerActions}>
            <button type="button" onClick={onClose} disabled={working}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.previewButton}
              onClick={generateProof}
              disabled={working}
            >
              {working
                ? "Creating Proof…"
                : proofMatchesDraft
                  ? "Create New Proof"
                  : "Generate Lob Proof"}
            </button>
            <button
              type="button"
              className={styles.liveButton}
              disabled
              title="Live mail will be enabled after the test workflow is approved."
            >
              Confirm & Mail
            </button>
          </div>
        </footer>
      </section>
    </>
  );
}
