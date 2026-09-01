"use client";

import { useState } from "react";
import styles from "./unsubscribe.module.css";

export default function UnsubscribeForm({ token, firstName = "" }) {
  const [working, setWorking] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");

  async function handleUnsubscribe() {
    setWorking(true);
    setMessage("");

    try {
      const res = await fetch(
        "/api/newsletters/unsubscribe?token=" + encodeURIComponent(token),
        { method: "POST" },
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unable to unsubscribe.");
      }

      setComplete(true);
    } catch (error) {
      setMessage(error.message || "Unable to unsubscribe.");
    } finally {
      setWorking(false);
    }
  }

  if (complete) {
    return (
      <>
        <p className={styles.eyebrow}>Email preferences</p>
        <h1>You’re unsubscribed.</h1>
        <p>
          {firstName ? `${firstName}, you` : "You"} will no longer receive
          newsletter emails from this list.
        </p>
      </>
    );
  }

  return (
    <>
      <p className={styles.eyebrow}>Email preferences</p>
      <h1>Unsubscribe from newsletters?</h1>
      <p>
        Confirm below and you will no longer receive newsletter emails from
        this list.
      </p>

      <button
        type="button"
        className={styles.unsubscribeButton}
        onClick={handleUnsubscribe}
        disabled={working}
      >
        {working ? "Updating…" : "Unsubscribe"}
      </button>

      {message && <p className={styles.errorMessage}>{message}</p>}
    </>
  );
}
