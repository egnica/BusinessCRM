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

function buildLobHtml(bodyHtml) {
  return [
    '<html style="padding-top: 3in; margin: .5in;">',
    bodyHtml.trim(),
    "</html>",
  ].join("");
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

  const [toAddress, setToAddress] = useState(parsedTo);
  const [fromAddress, setFromAddress] = useState(EMPTY_FROM);
  const [bodyHtml, setBodyHtml] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    setToAddress(parsedTo);
    setMessage("");
    setPreview(null);

    try {
      const savedDraft = draftKey
        ? window.localStorage.getItem(draftKey)
        : "";
      setBodyHtml(savedDraft || "");
    } catch {
      setBodyHtml("");
    }
  }, [draftKey, parsedTo, prospect?._id]);

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

  function updateBodyHtml(value) {
    setBodyHtml(value);
    setPreview(null);
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

  function clearDraft() {
    updateBodyHtml("");
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

  async function generateProof() {
    setMessage("");
    setPreview(null);

    if (!hasRequiredTo) {
      setMessage("Complete the recipient mailing address before previewing.");
      return;
    }

    if (!hasRequiredFrom) {
      setMessage("Complete the return address before previewing.");
      return;
    }

    if (!trimmedBodyHtml) {
      setMessage("Add letter content before previewing.");
      return;
    }

    if (finalLobHtml.length > 10000) {
      setMessage(
        "The finished Lob HTML is over 10,000 characters. Shorten the letter before previewing.",
      );
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
          data.details || data.error || "Could not create Lob test letter.",
        );
      }

      setMessage(
        "Lob accepted the test letter. Rendering proof…" +
          ` Body: ${data.submittedHtmlLength} chars · Final Lob HTML: ${data.finalHtmlLength} chars.`,
      );

      let finalProof = null;

      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const statusResponse = await fetch(
          "/api/lob/preview-letter?letterId=" +
            encodeURIComponent(data.letterId),
          { cache: "no-store" },
        );
        const statusData = await statusResponse.json();

        if (!statusResponse.ok) {
          throw new Error(
            statusData.details ||
              statusData.error ||
              "Could not check Lob proof status.",
          );
        }

        if (statusData.status === "failed") {
          throw new Error(
            statusData.failureReason || "Lob could not render the letter proof.",
          );
        }

        if (statusData.status === "rendered" && statusData.url) {
          finalProof = {
            ...statusData,
            submittedHtmlLength: data.submittedHtmlLength,
            finalHtmlLength: data.finalHtmlLength,
          };
          break;
        }

        setMessage(
          `Rendering proof… Lob status: ${statusData.status || "processing"} · Body: ${data.submittedHtmlLength} chars · Final Lob HTML: ${data.finalHtmlLength} chars.`,
        );
      }

      if (!finalProof) {
        throw new Error(
          "Lob accepted the letter, but the PDF was still rendering after about a minute. Try Preview again.",
        );
      }

      setPreview(finalProof);
      setMessage(
        `Lob test proof rendered. Nothing was mailed. Body: ${finalProof.submittedHtmlLength} chars · Final Lob HTML: ${finalProof.finalHtmlLength} chars.`,
      );
    } catch (error) {
      setMessage(error.message || "Could not generate Lob proof.");
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
            <p className={styles.eyebrow}>Lob test workflow</p>
            <h2>Create Letter</h2>
            <p>
              Write the letter in the CRM, verify the local HTML, then generate
              Lob's actual test PDF proof. Nothing can be mailed from this build.
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
                  <p>
                    Prefilled from the saved owner mailing address. Review it
                    before proofing.
                  </p>
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
                <h3>Letter HTML</h3>
                <p>
                  This draft is saved automatically for this prospect. Lob's
                  documented 3-inch address space is added when the letter is sent.
                </p>
              </div>

              <div className={styles.editorControls}>
                <label className={styles.templateField}>
                  <span>Template</span>
                  <select value="blank" disabled>
                    <option value="blank">Blank Letter</option>
                  </select>
                </label>

                <button
                  type="button"
                  className={styles.clearDraftButton}
                  onClick={clearDraft}
                  disabled={working || !bodyHtml}
                >
                  Clear Draft
                </button>
              </div>
            </div>

            <textarea
              className={styles.htmlEditor}
              value={bodyHtml}
              onChange={(event) => updateBodyHtml(event.target.value)}
              rows={18}
              spellCheck={false}
              placeholder={'<p>Dear Allen and Crystal,</p>\n\n<p>I wanted to reach out...</p>\n\n<p>Best,<br>Nick</p>'}
            />

            <div className={styles.editorMetrics}>
              <span>Body: {trimmedBodyHtml.length.toLocaleString()} characters</span>
              <span>
                Final Lob HTML: {finalLobHtml.length.toLocaleString()} / 10,000
              </span>
              <span>{draftKey ? "Draft auto-saved for this prospect" : ""}</span>
            </div>
          </section>

          {trimmedBodyHtml && (
            <section className={styles.localPreviewCard}>
              <div className={styles.proofHeader}>
                <div>
                  <h3>Local Letter Preview</h3>
                  <p>
                    This shows the exact HTML structure we will submit as Lob's
                    <code> file </code> value. Lob will overlay the mailing
                    addresses in the reserved top area.
                  </p>
                </div>
              </div>

              <iframe
                className={styles.localPreviewFrame}
                srcDoc={finalLobHtml}
                sandbox=""
                title="Local letter HTML preview"
              />
            </section>
          )}

          {message && <p className={styles.status}>{message}</p>}

          {preview?.url && (
            <section className={styles.proofCard}>
              <div className={styles.proofHeader}>
                <div>
                  <h3>Lob PDF Proof</h3>
                  <p>
                    Test letter {preview.letterId} · {preview.status || "rendered"}
                    {Number.isFinite(preview.submittedHtmlLength)
                      ? ` · body ${preview.submittedHtmlLength} chars`
                      : ""}
                    {Number.isFinite(preview.finalHtmlLength)
                      ? ` · final ${preview.finalHtmlLength} chars`
                      : ""}
                  </p>
                </div>
                <a href={preview.url} target="_blank" rel="noreferrer">
                  Open PDF in New Tab
                </a>
              </div>

              <iframe
                className={styles.proofFrame}
                src={preview.url + "#zoom=page-width"}
                title="Lob letter PDF proof"
              />
            </section>
          )}
        </div>

        <footer className={styles.footer}>
          <div>
            <strong>Test mode only</strong>
            <span>
              Live mailing is disabled. Preview requires complete addresses and
              non-empty letter HTML.
            </span>
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
              {working ? "Rendering Lob Proof…" : "Preview with Lob"}
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
