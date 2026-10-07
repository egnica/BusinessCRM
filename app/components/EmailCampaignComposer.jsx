"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./EmailHub.module.css";

function contactName(contact) {
  const personName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return contact.ownerNameRaw || personName || contact.company?.name || "Unnamed contact";
}

function businessName(contact) {
  return contact.company?.name || "—";
}

function contactSearchText(contact) {
  return [
    contactName(contact),
    businessName(contact),
    contact.email,
    contact.ownerType,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function canReceiveCampaign(contact) {
  return Boolean(
    String(contact.email || "").trim() && contact.emailStatus !== "unsubscribed",
  );
}

export default function EmailCampaignComposer({
  contacts,
  templates,
  config,
  loading,
  onOpenTester,
  onSent,
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!templateId && templates[0]) {
      setTemplateId(templates[0].id);
      setSubject(templates[0].subject || "");
    }
  }, [templateId, templates]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const visibleContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) => contactSearchText(contact).includes(query));
  }, [contacts, search]);

  const visibleEligibleIds = useMemo(
    () =>
      visibleContacts
        .filter(canReceiveCampaign)
        .map((contact) => String(contact._id)),
    [visibleContacts],
  );

  const allVisibleSelected =
    visibleEligibleIds.length > 0 &&
    visibleEligibleIds.every((id) => selectedSet.has(id));

  function handleTemplateChange(value) {
    setTemplateId(value);
    setPreviewHtml("");
    const template = templates.find((item) => item.id === value);
    if (template) setSubject(template.subject || "");
  }

  function toggleContact(id) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  function toggleVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleEligibleIds.forEach((id) => next.delete(id));
      } else {
        visibleEligibleIds.forEach((id) => next.add(id));
      }
      return Array.from(next);
    });
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

      if (!res.ok) {
        throw new Error(data.error || "Preview failed.");
      }

      setPreviewHtml(data.html || "");
    } catch (error) {
      setStatus(error.message || "Preview failed.");
    } finally {
      setWorking(false);
    }
  }

  async function handleSend() {
    if (!config.configured) {
      setStatus("Campaign sending is not fully configured yet.");
      return;
    }
    if (!templateId) {
      setStatus("Choose an email template first.");
      return;
    }
    if (selectedIds.length === 0) {
      setStatus("Select at least one contact before sending.");
      return;
    }

    const label = subject.trim() || "this campaign";
    const confirmed = window.confirm(
      `Send "${label}" to ${selectedIds.length} selected contact${
        selectedIds.length === 1 ? "" : "s"
      }?`,
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
          campaignName,
          contactIds: selectedIds,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Campaign send failed.");
      }

      setStatus(
        `Campaign complete: ${data.sentCount} sent, ${data.failedCount} failed.`,
      );
      setSelectedIds([]);
      onSent?.();
    } catch (error) {
      setStatus(error.message || "Campaign send failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.composerGrid}>
      <div className={styles.settingsColumn}>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Campaign name <small>optional</small></span>
            <input
              value={campaignName}
              onChange={(event) => setCampaignName(event.target.value)}
              placeholder="October client update"
              maxLength={200}
              disabled={working}
            />
          </label>

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
              config.configured ? styles.statusReady : styles.statusWarning
            }`}
          >
            {config.loading
              ? "Checking setup"
              : config.configured
                ? "Ready"
                : "Needs setup"}
          </span>
        </div>

        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handlePreview}
            disabled={working || !templateId}
          >
            Preview Template
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onOpenTester}
            disabled={working}
          >
            Test Template First
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSend}
            disabled={working || loading || selectedIds.length === 0 || !config.configured}
          >
            {working
              ? "Working…"
              : `Send to ${selectedIds.length} selected`}
          </button>
        </div>

        {status && <p className={styles.statusMessage}>{status}</p>}

        {previewHtml && (
          <div className={styles.previewPanel}>
            <div className={styles.previewHeader}>
              <strong>Template preview</strong>
              <button type="button" onClick={() => setPreviewHtml("")}>
                Hide
              </button>
            </div>
            <iframe
              title="Campaign template preview"
              srcDoc={previewHtml}
              sandbox=""
            />
          </div>
        )}
      </div>

      <div className={styles.contactsPanel}>
        <div className={styles.contactsToolbar}>
          <div>
            <strong>Select recipients</strong>
            <span>{selectedIds.length} selected</span>
          </div>
          <button
            type="button"
            className={styles.smallButton}
            onClick={toggleVisible}
            disabled={visibleEligibleIds.length === 0 || working}
          >
            {allVisibleSelected ? "Clear visible" : "Select visible"}
          </button>
        </div>

        <label className={styles.searchField}>
          <span className={styles.visuallyHidden}>Search contacts</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, business, or email…"
          />
        </label>

        <div className={styles.contactTable}>
          <div className={styles.contactTableHeader}>
            <span aria-hidden="true">✓</span>
            <span>Name</span>
            <span>Business</span>
            <span>Email</span>
            <span>Status</span>
          </div>

          {loading ? (
            <p className={styles.tableNotice}>Loading contacts…</p>
          ) : visibleContacts.length === 0 ? (
            <p className={styles.tableNotice}>No contacts match this search.</p>
          ) : (
            visibleContacts.map((contact) => {
              const id = String(contact._id);
              const eligible = canReceiveCampaign(contact);
              const selected = selectedSet.has(id);

              return (
                <label
                  className={`${styles.contactRow} ${
                    !eligible ? styles.contactRowDisabled : ""
                  }`}
                  key={id}
                >
                  <span>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleContact(id)}
                      disabled={!eligible || working}
                    />
                  </span>
                  <strong>{contactName(contact)}</strong>
                  <span>{businessName(contact)}</span>
                  <span className={styles.emailCell}>{contact.email || "No email"}</span>
                  <span>
                    <span
                      className={`${styles.contactStatus} ${
                        eligible
                          ? styles.contactStatusReady
                          : styles.contactStatusBlocked
                      }`}
                    >
                      {contact.emailStatus === "unsubscribed"
                        ? "Unsubscribed"
                        : contact.email
                          ? "Subscribed"
                          : "No email"}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
