"use client";

import { useEffect, useRef, useState } from "react";
import { CONTACT_DRAFT_KEY, EMPTY_CONTACT, readContactDraft, writeContactDraft } from "@/lib/contactDraft.mjs";

export default function useNewContactDraft(onRestore) {
  const [formData, setFormData] = useState({ ...EMPTY_CONTACT });
  const [draftStatus, setDraftStatus] = useState("");
  const [ready, setReady] = useState(false);
  const requestId = useRef("");

  useEffect(() => {
    requestId.current = crypto.randomUUID();
    try {
      const draft = readContactDraft(window.localStorage);
      if (draft) {
        requestId.current = draft.requestId;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restore browser draft after hydration
        setFormData(draft.formData);
        setDraftStatus("Draft restored. Your contact details are kept in this browser.");
        onRestore(true);
      }
    } catch {
      setDraftStatus("Browser draft recovery is unavailable. Keep this page open until your contact is saved.");
    }
    setReady(true);
  }, [onRestore]);

  function persist(next) {
    try {
      writeContactDraft(window.localStorage, next, requestId.current);
      setDraftStatus("Draft kept in this browser until the contact is saved or discarded.");
    } catch {
      setDraftStatus("Could not keep a browser draft. Your details are still on this page; avoid refreshing until saved.");
    }
  }

  function handleChange(event) {
    const next = { ...formData, [event.target.name]: event.target.value };
    setFormData(next);
    persist(next);
  }

  function resetDraft() {
    // Remove storage before clearing the form so a storage error leaves a
    // recoverable draft, rather than silently restoring an already saved form.
    window.localStorage.removeItem(CONTACT_DRAFT_KEY);
    requestId.current = crypto.randomUUID();
    setFormData({ ...EMPTY_CONTACT });
    setDraftStatus("");
  }

  return { formData, handleChange, resetDraft, draftStatus, ready,
    requestId, persist };
}
