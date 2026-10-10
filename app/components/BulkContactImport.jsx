"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IMPORT_FIELD_DEFINITIONS,
  IMPORT_ADDITIONAL_FIELDS,
  guessImportField,
  mapCsvRows,
  parseCsvText,
} from "@/lib/contactImport.mjs";
import styles from "./BulkContactImport.module.css";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function displayName(contact) {
  const person = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return person || contact.companyName || "—";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function BulkContactImport({ onClose, onImported }) {
  const [stage, setStage] = useState("upload");
  const [fileName, setFileName] = useState("");
  const [batchId, setBatchId] = useState("");
  const [headers, setHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [mapping, setMapping] = useState([]);
  const [additionalFields, setAdditionalFields] = useState([]);
  const [preview, setPreview] = useState(null);
  const [duplicateMode, setDuplicateMode] = useState("skip");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/contacts/bulk/history", { cache: "no-store" })
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (active && response.ok && Array.isArray(data.imports)) setHistory(data.imports);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const mappedRows = useMemo(
    () => (headers.length ? mapCsvRows(headers, csvRows, mapping) : []),
    [headers, csvRows, mapping],
  );

  const usedFields = useMemo(
    () => new Set(mapping.filter(Boolean)),
    [mapping],
  );

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setPreview(null);
    setResult(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("CSV files are limited to 5 MB.");
      return;
    }

    try {
      const parsed = parseCsvText(await file.text());
      const guessed = parsed.headers.map((header) => guessImportField(header));
      const seen = new Set();
      const dedupedMapping = guessed.map((field) => {
        if (!field || seen.has(field)) return "";
        seen.add(field);
        return field;
      });

      setFileName(file.name);
      setBatchId(crypto.randomUUID());
      setHeaders(parsed.headers);
      setCsvRows(parsed.rows);
      setMapping(dedupedMapping);
      setAdditionalFields([]);
      setStage("map");
    } catch (fileError) {
      setError(fileError.message || "Could not read that CSV.");
    }
  }

  function changeMapping(index, value) {
    setMapping((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setPreview(null);
  }

  async function reviewImport() {
    const mappedCount = mapping.filter(Boolean).length;
    if (!mappedCount) {
      setError("Map at least one CSV column before continuing.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/contacts/bulk/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ rows: mappedRows, additionalFields }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not preview the import.");
      setPreview(data);
      setStage("preview");
    } catch (previewError) {
      setError(previewError.name === "TimeoutError"
        ? "The preview took too long. Try again."
        : previewError.message);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/contacts/bulk/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({
          rows: mappedRows,
          additionalFields,
          fileName,
          batchId,
          duplicateMode,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not import contacts.");
      setResult(data);
      setStage("result");
      if (onImported) await onImported(data);
    } catch (importError) {
      setError(importError.name === "TimeoutError"
        ? "The import may still be processing. Do not start a new copy of this import yet; retry this same import to check its batch status."
        : importError.message);
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setStage("upload");
    setFileName("");
    setBatchId("");
    setHeaders([]);
    setCsvRows([]);
    setMapping([]);
    setAdditionalFields([]);
    setPreview(null);
    setResult(null);
    setError("");
  }

  const previewRows = preview?.rows || [];
  const summary = preview?.summary || { ready: 0, duplicate: 0, invalid: 0 };

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="bulk-import-title">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Contact directory</p>
            <h2 id="bulk-import-title">Import CSV</h2>
            <p>Map a spreadsheet into CRM contacts, review problems, then choose how duplicates should be handled.</p>
          </div>
          <button className={styles.closeButton} type="button" onClick={onClose} disabled={busy} aria-label="Close import">
            ×
          </button>
        </header>

        <div className={styles.steps} aria-label="Import progress">
          <span data-active={stage === "upload"}>1 Upload</span>
          <span data-active={stage === "map"}>2 Map</span>
          <span data-active={stage === "preview"}>3 Review</span>
          <span data-active={stage === "result"}>4 Results</span>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        {stage === "upload" && (
          <div className={styles.body}>
            <label className={styles.dropZone}>
              <strong>Choose a CSV of contacts</strong>
              <span>Header row required · up to 2,500 rows · 5 MB maximum</span>
              <input type="file" accept=".csv,text/csv" onChange={handleFile} />
            </label>

            <section className={styles.history}>
              <div className={styles.sectionHeading}>
                <div>
                  <h3>Previous imports</h3>
                  <p>Recent CSV batches are kept here so imported contacts can be traced back to their source.</p>
                </div>
              </div>
              {history.length ? (
                <div className={styles.historyList}>
                  {history.map((item) => (
                    <div className={styles.historyItem} key={item.batchId}>
                      <div>
                        <strong>{item.fileName}</strong>
                        <span>{formatDate(item.completedAt || item.createdAt)}</span>
                      </div>
                      <div className={styles.historyStats}>
                        <span>{item.importedCount} added</span>
                        {item.updatedCount > 0 && <span>{item.updatedCount} updated</span>}
                        {item.skippedCount > 0 && <span>{item.skippedCount} skipped</span>}
                        {item.errorCount > 0 && <span>{item.errorCount} errors</span>}
                        {item.status !== "completed" && <span>{item.status}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyCopy}>No CSV imports yet.</p>
              )}
            </section>
          </div>
        )}

        {stage === "map" && (
          <div className={styles.body}>
            <div className={styles.fileSummary}>
              <div>
                <strong>{fileName}</strong>
                <span>{csvRows.length} contact rows detected</span>
              </div>
              <button type="button" className={styles.textButton} onClick={startOver}>Choose another file</button>
            </div>

            <div className={styles.sectionHeading}>
              <div>
                <h3>Map CSV columns</h3>
                <p>We guessed common headers. Review the mapping before anything is sent to MongoDB.</p>
              </div>
            </div>

            <div className={styles.mappingTable}>
              <div className={styles.mappingHeader}>
                <span>CSV column</span>
                <span>Sample</span>
                <span>CRM field</span>
              </div>
              {headers.map((header, index) => {
                const sample = csvRows.slice(0, 5).map((row) => row[index]).find((value) => String(value || "").trim());
                return (
                  <div className={styles.mappingRow} key={header + "-" + index}>
                    <strong>{header}</strong>
                    <span className={styles.sample}>{sample || "—"}</span>
                    <select value={mapping[index] || ""} onChange={(event) => changeMapping(index, event.target.value)}>
                      <option value="">Do not import</option>
                      {IMPORT_FIELD_DEFINITIONS.map((field) => (
                        <option
                          key={field.key}
                          value={field.key}
                          disabled={usedFields.has(field.key) && mapping[index] !== field.key}
                        >
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <section className={styles.additionalFields}>
              <div className={styles.sectionHeading}>
                <div>
                  <h3>Additional fields</h3>
                  <p>Optional. Apply a value to every imported contact where the CSV has no value. Existing contacts are not changed by these fields.</p>
                </div>
              </div>
              {additionalFields.map((entry, index) => (
                <div className={styles.additionalFieldRow} key={entry.id}>
                  <select
                    aria-label={"Additional CRM field " + (index + 1)}
                    value={entry.key}
                    onChange={(event) => {
                      setAdditionalFields((current) => current.map((item) => item.id === entry.id
                        ? { ...item, key: event.target.value, value: "" }
                        : item));
                      setPreview(null);
                    }}
                  >
                    <option value="">Select field</option>
                    {IMPORT_ADDITIONAL_FIELDS.map((field) => (
                      <option
                        key={field.key}
                        value={field.key}
                        disabled={(usedFields.has(field.key) || additionalFields.some((item) => item.id !== entry.id && item.key === field.key))}
                      >
                        {field.label}
                      </option>
                    ))}
                  </select>
                  {entry.key === "rank" ? (
                    <select aria-label="Rank value" value={entry.value} onChange={(event) => {
                      setAdditionalFields((current) => current.map((item) => item.id === entry.id ? { ...item, value: event.target.value } : item));
                      setPreview(null);
                    }}>
                      <option value="">Select rank</option>
                      {["A", "B", "C", "D"].map((rank) => <option key={rank} value={rank}>{rank}</option>)}
                    </select>
                  ) : entry.key === "emailStatus" ? (
                    <select aria-label="Email status value" value={entry.value} onChange={(event) => {
                      setAdditionalFields((current) => current.map((item) => item.id === entry.id ? { ...item, value: event.target.value } : item));
                      setPreview(null);
                    }}>
                      <option value="">Select email status</option>
                      <option value="unknown">Unknown</option>
                      <option value="unsubscribed">Unsubscribed</option>
                      <option value="subscribed">Subscribed (only with consent)</option>
                    </select>
                  ) : (
                    <input
                      aria-label="Field value"
                      placeholder="Value for this batch"
                      value={entry.value}
                      onChange={(event) => {
                        setAdditionalFields((current) => current.map((item) => item.id === entry.id ? { ...item, value: event.target.value } : item));
                        setPreview(null);
                      }}
                    />
                  )}
                  <button type="button" className={styles.textButton} onClick={() => {
                    setAdditionalFields((current) => current.filter((item) => item.id !== entry.id));
                    setPreview(null);
                  }} aria-label="Remove field">Remove</button>
                </div>
              ))}
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={additionalFields.length >= IMPORT_ADDITIONAL_FIELDS.length - usedFields.size}
                onClick={() => setAdditionalFields((current) => [...current, { id: crypto.randomUUID(), key: "", value: "" }])}
              >
                + Add field
              </button>
            </section>
          </div>
        )}

        {stage === "preview" && (
          <div className={styles.body}>
            <div className={styles.summaryGrid}>
              <div><strong>{csvRows.length}</strong><span>Rows</span></div>
              <div><strong>{summary.ready}</strong><span>Ready</span></div>
              <div><strong>{summary.duplicate}</strong><span>Duplicates</span></div>
              <div><strong>{summary.invalid}</strong><span>Need attention</span></div>
            </div>

            <div className={styles.duplicateControls}>
              <label>
                <span>When a duplicate is found</span>
                <select value={duplicateMode} onChange={(event) => setDuplicateMode(event.target.value)}>
                  <option value="skip">Skip duplicate — recommended</option>
                  <option value="update">Update the existing contact</option>
                  <option value="import">Import another copy anyway</option>
                </select>
              </label>
              <p>Matches use email, LinkedIn, phone, then name + company or LLC/company name. Without an explicit email status, new contacts start as “unknown.” Additional fields do not overwrite existing contacts.</p>
              {additionalFields.some((item) => item.key && item.value) && <p><strong>Applied to new contacts:</strong> {additionalFields.filter((item) => item.key && item.value).map((item) => `${IMPORT_ADDITIONAL_FIELDS.find((field) => field.key === item.key)?.label}: ${item.value}`).join(" · ")}</p>}
            </div>

            <div className={styles.previewTable}>
              <div className={styles.previewHeader}>
                <span>Row</span>
                <span>Contact</span>
                <span>Company</span>
                <span>Email</span>
                <span>Status</span>
              </div>
              {previewRows.slice(0, 50).map((row) => (
                <div className={styles.previewRow} key={row.rowNumber}>
                  <span>{row.rowNumber}</span>
                  <strong>{displayName(row.contact)}</strong>
                  <span>{row.contact.companyName || "—"}</span>
                  <span className={styles.truncate}>{row.contact.email || "—"}</span>
                  <span className={styles.status} data-status={row.status}>
                    {row.status === "ready" && "Ready"}
                    {row.status === "invalid" && (row.errors[0] || "Needs attention")}
                    {row.status === "duplicate" && "Duplicate: " + (row.duplicate?.matchType || "match")}
                  </span>
                </div>
              ))}
            </div>
            {previewRows.length > 50 && (
              <p className={styles.tableNote}>Showing the first 50 rows. All {previewRows.length} rows will use the same validation and duplicate rules.</p>
            )}
          </div>
        )}

        {stage === "result" && result && (
          <div className={styles.body}>
            <div className={styles.resultHero}>
              <span className={styles.resultIcon}>✓</span>
              <div>
                <h3>Import complete</h3>
                <p>{result.fileName}</p>
              </div>
            </div>
            <div className={styles.summaryGrid}>
              <div><strong>{result.importedCount}</strong><span>Added</span></div>
              <div><strong>{result.updatedCount}</strong><span>Updated</span></div>
              <div><strong>{result.skippedCount}</strong><span>Skipped</span></div>
              <div><strong>{result.errorCount}</strong><span>Errors</span></div>
            </div>
            {result.errors?.length > 0 && (
              <div className={styles.errorList}>
                <h3>Rows that were not imported</h3>
                {result.errors.map((item) => (
                  <p key={item.rowNumber}><strong>Row {item.rowNumber}:</strong> {item.messages.join(" ")}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <footer className={styles.footer}>
          {stage === "map" && (
            <>
              <button type="button" className={styles.secondaryButton} onClick={startOver} disabled={busy}>Back</button>
              <button type="button" className={styles.primaryButton} onClick={reviewImport} disabled={busy}>
                {busy ? "Checking…" : "Review import"}
              </button>
            </>
          )}
          {stage === "preview" && (
            <>
              <button type="button" className={styles.secondaryButton} onClick={() => setStage("map")} disabled={busy}>Back to mapping</button>
              <button type="button" className={styles.primaryButton} onClick={runImport} disabled={busy}>
                {busy ? "Importing…" : "Import contacts"}
              </button>
            </>
          )}
          {stage === "result" && (
            <>
              <button type="button" className={styles.secondaryButton} onClick={startOver}>Import another CSV</button>
              <button type="button" className={styles.primaryButton} onClick={onClose}>Done</button>
            </>
          )}
          {stage === "upload" && (
            <button type="button" className={styles.secondaryButton} onClick={onClose}>Cancel</button>
          )}
        </footer>
      </section>
    </div>
  );
}
