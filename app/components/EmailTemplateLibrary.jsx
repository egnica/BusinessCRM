"use client";

import styles from "./EmailHub.module.css";

const DISPLAY_TEMPLATE_PATH = "crm-app/lib/emailTemplates";
const REPO_TEMPLATE_PATH = "lib/emailTemplates";

export default function EmailTemplateLibrary({ templates, loading }) {
  return (
    <div className={styles.templateLibrary}>
      <div className={styles.pathNotice}>
        <span>Template files live in</span>
        <code>{DISPLAY_TEMPLATE_PATH}</code>
        <small>Repository path: {REPO_TEMPLATE_PATH}</small>
      </div>

      {loading ? (
        <p className={styles.tableNotice}>Loading templates…</p>
      ) : templates.length === 0 ? (
        <p className={styles.tableNotice}>No email templates are registered.</p>
      ) : (
        <div className={styles.templateList}>
          {templates.map((template) => (
            <article className={styles.templateCard} key={template.id}>
              <div>
                <p className={styles.eyebrow}>Registered template</p>
                <h3>{template.name}</h3>
                <p>{template.subject || "No default subject"}</p>
              </div>
              <div className={styles.templateMeta}>
                <span>Template ID</span>
                <code>{template.id}</code>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
