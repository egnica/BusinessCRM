"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [toAddress, setToAddress] = useState(parsedTo);
  const [fromAddress, setFromAddress] = useState(EMPTY_FROM);
  const [bodyHtml, setBodyHtml] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    setToAddress(parsedTo);
    setBodyHtml("");
    setMessage("");
    setPreview(null);
  }, [parsedTo, prospect?._id]);

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

  function updateTo(name, value) {
    setToAddress((current) => ({ ...current, [name]: value }));
    setPreview(null);
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
    setPreview(null);
  }

  async function generateProof() {
    setWorking(true);
    setMessage("");
    setPreview(null);

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
          bodyHtml,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.details || data.error || "Could not generate Lob proof.",
        );
      }

      setPreview(data);
      setMessage(
        data.url
          ? "Lob test proof generated. Nothing was mailed."
          : "Lob accepted the test letter, but the PDF is still rendering. Try Preview again in a moment.",
      );
    } catch (error) {
      setMessage(error.message || "Could not generate Lob proof.");
    } finally {
      setWorking(false);
    }
  }

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

  return (
    <>
      <div className={styles.backdrop} onClick={working ? undefined : onClose} />

      <section className={styles.modal} aria-label="Create property owner letter">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Lob test workflow</p>
            <h2>Create Letter</h2>
            <p>
              Build a custom HTML letter and generate the actual Lob PDF proof.
              Test mode never mails the piece.
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
                  <p>Prefilled from the saved owner mailing address. Review it before proofing.</p>
                </div>
              </div>
              <AddressFields value={toAddress} onChange={updateTo} prefix="To" />
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeading}>
                <div>
                  <h3>Return Address</h3>
                  <p>Saved in this browser so you only need to enter it once.</p>
                </div>
              </div>
              <AddressFields
                value={fromAddress}
                onChange={updateFrom}
                prefix="From"
              />
            </section>
          </div>

          <section className={styles.card}>
            <div className={styles.editorHeader}>
              <div>
                <h3>Letter</h3>
                <p>
                  The Blank Letter template automatically reserves Lob's address-window area.
                  Edit only the letter content below it.
                </p>
              </div>

              <label className={styles.templateField}>
                <span>Template</span>
                <select value="blank" disabled>
                  <option value="blank">Blank Letter</option>
                </select>
              </label>
            </div>

            <textarea
              className={styles.htmlEditor}
              value={bodyHtml}
              onChange={(event) => {
                setBodyHtml(event.target.value);
                setPreview(null);
              }}
              rows={18}
              spellCheck={false}
              placeholder={'<p>Dear Allen and Crystal,</p>\n\n<p>I wanted to reach out...</p>\n\n<p>Best,<br>Nick</p>'}
            />

            <p className={styles.editorNote}>
              HTML is sent to Lob inside a fixed 8.5 × 11 letter shell. The
              first-page address area is protected automatically.
            </p>
          </section>

          {message && <p className={styles.status}>{message}</p>}

          {preview?.url && (
            <section className={styles.proofCard}>
              <div className={styles.proofHeader}>
                <div>
                  <h3>Lob PDF Proof</h3>
                  <p>
                    Test letter {preview.letterId} · {preview.status || "rendered"}
                  </p>
                </div>
                <a href={preview.url} target="_blank" rel="noreferrer">
                  Open PDF in New Tab
                </a>
              </div>

              <iframe
                className={styles.proofFrame}
                src={preview.url}
                title="Lob letter PDF proof"
              />
            </section>
          )}
        </div>

        <footer className={styles.footer}>
          <div>
            <strong>Test mode only</strong>
            <span>Live mailing remains disabled in this build.</span>
          </div>

          <div className={styles.footerActions}>
            <button type="button" onClick={onClose} disabled={working}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.previewButton}
              onClick={generateProof}
              disabled={working || !hasRequiredTo || !hasRequiredFrom}
              title={
                !hasRequiredTo || !hasRequiredFrom
                  ? "Complete both mailing addresses first."
                  : ""
              }
            >
              {working ? "Generating Proof…" : "Preview with Lob"}
            </button>
            <button
              type="button"
              className={styles.liveButton}
              disabled
              title="Live mail will be enabled only after the test proof workflow is approved."
            >
              Confirm & Mail
            </button>
          </div>
        </footer>
      </section>
    </>
  );
}
