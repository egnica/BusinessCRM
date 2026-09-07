"use client";

import Link from "next/link";
import { useState } from "react";
import ContactEmailActivity from "./ContactEmailActivity";
import HtmlEmailModal from "./HtmlEmailModal";
import pageStyles from "../page.module.css";
import styles from "./CommunicationWorkspace.module.css";

export default function EmailWorkspace() {
  const [historyRefresh, setHistoryRefresh] = useState(0);

  return (
    <main className={pageStyles.pageShell}>
      <section className={styles.workspaceHeader}>
        <div>
          <Link className={styles.backLink} href="/">
            ← Back to CRM
          </Link>
          <p className={styles.eyebrow}>One-to-one email workspace</p>
          <h1>Email</h1>
          <p>
            Enter any email address, compose the HTML, preview the branded
            message, and send it from nick@nicholasegner.com.
          </p>
        </div>

        <nav className={styles.workspaceLinks} aria-label="Communication tools">
          <Link className={styles.workspaceLink} href="/letters">
            Letters
          </Link>
          <Link className={styles.workspaceLinkActive} href="/email">
            Email
          </Link>
        </nav>
      </section>

      <HtmlEmailModal
        standalone
        onSent={() => setHistoryRefresh((value) => value + 1)}
      />

      <section className={styles.emailHistoryPanel}>
        <ContactEmailActivity
          refreshKey={historyRefresh}
          title="HTML Email History"
          description="Manual and contact-linked HTML emails with Resend delivery events."
          emptyMessage="No HTML emails have been sent yet."
        />
      </section>
    </main>
  );
}
