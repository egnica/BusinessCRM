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
  const proofKey = useMemo(
    () => (prospect?._id ? `crmLobLetterProof:${prospect._id}` : ""),
    [prospect?._id],
  );

  const [toAddress, setToAddress] = useState(parsedTo);
  const [fromAddress, setFromAddress] = useState(EMPTY_FROM);
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
      // Proof persistence is a convenience only.
    }
  }

  useEffect(() => {
    setToAddress(parsedTo);
    setMessage("");

    try {
      const savedDraft = draftKey
        ? window.localStorage.getItem(draftKey)
        : "";
      setBodyHtml(savedDraft || "");

      const savedProof = proofKey
        ? window.localStorage.getItem(proofKey)
        : "";
      setProof(savedProof ? JSON.parse(savedProof) : null);
    } catch {
      setBodyHtml("");
      setProof(null);
    }
  }, [draftKey, parsedTo, proofKey, prospect?._id]);

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
              "Could not check Lob proof status.",
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
          setMessage("Lob PDF proof is ready. Nothing was mailed.");
          return;
        }

        if (data.status === "failed") {
          setMessage(
            data.failureReason ||
              "Lob could not render this test letter.",
          );
          return;
        }

        setMessage(
          `Lob accepted the letter. Proof status: ${data.status || "processing"}. The CRM will keep checking automatically.`,
        );
        timeoutId = window.setTimeout(pollProof, 5000);
      } catch (error) {
        if (cancelled) return;
        setMessage(
          (error.message || "Could not check Lob proof status.") +
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

  const proofMatchesDraft = Boolean(
    proof?.bodyHtmlSnapshot &&
      proof.bodyHtmlSnapshot === trimmedBodyHtml,
  );

  async function checkProofStatus() {
    if (!proof?.letterId) return;

    setCheckingProof(true);
    setMessage("Checking Lob proof status…");

    try {
      const response = await fetch(
        "/api/lob/preview-letter?letterId=" +
          encodeURIComponent(proof.letterId),
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.details || data.error || "Could not check Lob proof status.",
        );
      }

      const nextProof = {
        ...proof,
        ...data,
        lastCheckedAt: new Date().toISOString(),
      };

      persistProof(nextProof);

      if (data.status === "rendered" && data.url) {
        setMessage("Lob PDF proof is ready. Nothing was mailed.");
      } else if (data.status === "failed") {
        setMessage(
          data.failureReason || "Lob could not render this test letter.",
        );
      } else {
        setMessage(
          `Lob proof status: ${data.status || "processing"}. The CRM will keep checking automatically.`,
        );
      }
    } catch (error) {
      setMessage(error.message || "Could not check Lob proof status.");
    } finally {
      setCheckingProof(false);
    }
  }

  async function generateProof() {
    setMessage("");

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

      const nextProof = {
        letterId: data.letterId,
        status: data.status || "processed",
        url: "",
        thumbnails: [],
        submittedHtmlLength: data.submittedHtmlLength,
        finalHtmlLength: data.finalHtmlLength,
        bodyHtmlSnapshot: trimmedBodyHtml,
        createdAt: new Date().toISOString(),
        lastCheckedAt: null,
        testMode: true,
      };

      persistProof(nextProof);
      setMessage(
        `Lob accepted test letter ${data.letterId}. Proof status: ${nextProof.status}. The CRM will keep checking automatically; you can close this window and come back later.`,
      );
    } catch (error) {
      setMessage(error.message || "Could not create Lob test letter.");
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
              Write the letter in the CRM, verify the local HTML, then create a
              Lob test proof. Lob rendering continues independently after the
              request is accepted.
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
                    This shows the exact HTML structure submitted as Lob's
                    <code> file </code> value. Lob overlays the mailing addresses
                    in the reserved top area.
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

          {proof?.letterId && (
            <section className={styles.proofCard}>
              <div className={styles.proofHeader}>
                <div>
                  <h3>Lob Proof Status</h3>
                  <p>
                    Test letter {proof.letterId} · {proof.status || "processing"}
                    {Number.isFinite(proof.submittedHtmlLength)
                      ? ` · body ${proof.submittedHtmlLength} chars`
                      : ""}
                    {Number.isFinite(proof.finalHtmlLength)
                      ? ` · final ${proof.finalHtmlLength} chars`
                      : ""}
                  </p>
                  {!proofMatchesDraft && (
                    <p>
                      This Lob proof belongs to an earlier version of the draft.
                      Create a new proof when you want Lob to render the current text.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className={styles.clearDraftButton}
                  onClick={checkProofStatus}
                  disabled={checkingProof || working}
                >
                  {checkingProof ? "Checking…" : "Check Proof Status"}
                </button>
              </div>

              {proof.status === "rendered" && proof.url ? (
                <>
                  <div className={styles.proofHeader}>
                    <span />
                    <a href={proof.url} target="_blank" rel="noreferrer">
                      Open PDF in New Tab
                    </a>
                  </div>
                  <iframe
                    className={styles.proofFrame}
                    src={proof.url + "#zoom=page-width"}
                    title="Lob letter PDF proof"
                  />
                </>
              ) : (
                <p className={styles.status}>
                  Lob is still processing this proof. You do not need to create
                  another test letter. The CRM will keep checking while this
                  window is open, and this letter ID is saved if you come back later.
                </p>
              )}
            </section>
          )}

          {message && <p className={styles.status}>{message}</p>}
        </div>

        <footer className={styles.footer}>
          <div>
            <strong>Test mode only</strong>
            <span>
              Live mailing is disabled. Creating a proof does not mail anything.
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
              {working
                ? "Creating Lob Proof…"
                : proofMatchesDraft
                  ? "Create New Lob Proof"
                  : "Preview with Lob"}
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
