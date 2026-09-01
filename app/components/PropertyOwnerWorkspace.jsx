"use client";

import { useState } from "react";
import PropertyOwnerSearch from "./PropertyOwnerSearch";
import PropertyProspectList from "./PropertyProspectList";
import PropertyProspectPanel from "./PropertyProspectPanel";
import LetterComposerModal from "./LetterComposerModal";
import styles from "../page.module.css";

export default function PropertyOwnerWorkspace({
  onBack,
  onContactPromoted,
}) {
  const [tab, setTab] = useState("find");
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [letterProspect, setLetterProspect] = useState(null);

  function handleSaved() {
    setSavedRefreshKey((value) => value + 1);
  }

  function handlePanelUpdated(updatedProspect) {
    setSelectedProspect(updatedProspect);
    setSavedRefreshKey((value) => value + 1);
  }

  function handlePromoted(prospectId, contactId) {
    setSelectedProspect((current) =>
      current?._id === prospectId
        ? { ...current, crmContactId: contactId }
        : current,
    );
    setSavedRefreshKey((value) => value + 1);
    onContactPromoted?.();
  }

  return (
    <main className={styles.pageShell}>
      <section className={styles.propertyWorkspaceHeader}>
        <div>
          <button
            type="button"
            className={styles.propertyBackButton}
            onClick={onBack}
          >
            ← Back to CRM
          </button>
          <p className={styles.eyebrow}>Prospecting workspace</p>
          <h1>Property Owner Outreach</h1>
          <p>
            Search public Twin Cities metro parcel records, save only the
            owners worth pursuing, and keep prospecting separate from your
            main CRM contacts.
          </p>
        </div>

        <div className={styles.propertyWorkspaceTabs}>
          <button
            type="button"
            className={tab === "find" ? styles.propertyTabActive : ""}
            onClick={() => setTab("find")}
          >
            Find Owners
          </button>
          <button
            type="button"
            className={tab === "saved" ? styles.propertyTabActive : ""}
            onClick={() => setTab("saved")}
          >
            Saved Prospects
          </button>
        </div>
      </section>

      {tab === "find" ? (
        <PropertyOwnerSearch onSaved={handleSaved} />
      ) : (
        <PropertyProspectList
          refreshKey={savedRefreshKey}
          onSelect={setSelectedProspect}
          onPromoted={handlePromoted}
          onSendLetter={setLetterProspect}
        />
      )}

      {selectedProspect && (
        <PropertyProspectPanel
          prospect={selectedProspect}
          onClose={() => setSelectedProspect(null)}
          onUpdated={handlePanelUpdated}
          onPromoted={handlePromoted}
          onSendLetter={setLetterProspect}
        />
      )}
    </main>
  );
}
