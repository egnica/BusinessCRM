"use client";

import Link from "next/link";
import { useState } from "react";
import LetterComposerModal from "./LetterComposerModal";
import LetterHistory from "./LetterHistory";
import pageStyles from "../page.module.css";
import styles from "./CommunicationWorkspace.module.css";

export default function LettersWorkspace() {
  const [historyRefresh, setHistoryRefresh] = useState(0);

  return (
    <main className={pageStyles.pageShell}>
      <section className={styles.workspaceHeader}>
        <div>
          <Link className={styles.backLink} href="/">
            ← Back to CRM
          </Link>
          <p className={styles.eyebrow}>Lob mailing workspace</p>
          <h1>Letters</h1>
          <p>
            Enter any mailing address, create the letter, review the Lob proof,
            and explicitly confirm live mail.
          </p>
        </div>

        <nav className={styles.workspaceLinks} aria-label="Communication tools">
          <Link className={styles.workspaceLinkActive} href="/letters">
            Letters
          </Link>
          <Link className={styles.workspaceLink} href="/email">
            Email
          </Link>
        </nav>
      </section>

      <LetterComposerModal
        standalone
        onSent={() => setHistoryRefresh((value) => value + 1)}
      />
      <LetterHistory refreshKey={historyRefresh} />
    </main>
  );
}
