"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ContactEmailActivity from "./ContactEmailActivity";
import EmailCampaignComposer from "./EmailCampaignComposer";
import EmailDashboard from "./EmailDashboard";
import EmailTemplateLibrary from "./EmailTemplateLibrary";
import EmailTemplateTester from "./EmailTemplateTester";
import HtmlEmailModal from "./HtmlEmailModal";
import pageStyles from "../page.module.css";
import styles from "./EmailHub.module.css";

const tools = [
  {
    id: "send",
    title: "Send Email",
    description: "Write and send a one-off HTML email to one recipient.",
  },
  {
    id: "campaigns",
    title: "Campaigns",
    description: "Choose CRM contacts, pick a template, preview, and send.",
  },
  {
    id: "test",
    title: "Test Template",
    description: "Send yourself a real copy of any registered template.",
  },
  {
    id: "templates",
    title: "Templates",
    description: "See the templates available to campaigns and where they live.",
  },
];

export default function EmailWorkspace() {
  const [activeTool, setActiveTool] = useState("home");
  const [selectedFromEmail, setSelectedFromEmail] = useState("");
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [config, setConfig] = useState({
    loading: true,
    configured: false,
    resendConfigured: false,
    unsubscribeConfigured: false,
    fromEmail: "",
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [htmlHistoryRefresh, setHtmlHistoryRefresh] = useState(0);
  const [campaignHistoryRefresh, setCampaignHistoryRefresh] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadHub() {
      setLoading(true);
      setLoadError("");

      try {
        const [contactsRes, templatesRes, statusRes] = await Promise.all([
          fetch("/api/contacts", { cache: "no-store" }),
          fetch("/api/newsletters/templates", { cache: "no-store" }),
          fetch("/api/newsletters/status", { cache: "no-store" }),
        ]);

        const [contactsData, templatesData, statusData] = await Promise.all([
          contactsRes.json(),
          templatesRes.json(),
          statusRes.json(),
        ]);

        if (!contactsRes.ok) {
          throw new Error(contactsData.error || "Could not load CRM contacts.");
        }
        if (!templatesRes.ok) {
          throw new Error(templatesData.error || "Could not load email templates.");
        }
        if (!statusRes.ok) {
          throw new Error(statusData.error || "Could not check email configuration.");
        }

        if (!active) return;

        setContacts(contactsData.contacts || []);
        setTemplates(templatesData.templates || []);
        setConfig({
          loading: false,
          configured: Boolean(statusData.configured),
          resendConfigured: Boolean(statusData.resendConfigured),
          unsubscribeConfigured: Boolean(statusData.unsubscribeConfigured),
          fromEmail: statusData.fromEmail || "",
          defaultFromEmail: statusData.defaultFromEmail || "nick@nicholasegner.com",
          senderOptions: statusData.senderOptions || [],
        });
      } catch (error) {
        if (!active) return;
        setConfig((current) => ({ ...current, loading: false }));
        setLoadError(error.message || "Could not load the email workspace.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHub();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className={pageStyles.pageShell}>
      <section className={styles.header}>
        <div>
          <Link className={styles.backLink} href="/">
            ← Back to CRM
          </Link>
          <p className={styles.eyebrow}>Communication center</p>
          <h1>Email</h1>
          <p className={styles.headerCopy}>
            Send one-off messages, build targeted campaigns, test templates, and
            review the email templates available in the CRM.
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

      <section className={styles.toolGrid} aria-label="Email tools">
        {tools.map((tool) => (
          <button
            type="button"
            className={`${styles.toolCard} ${
              activeTool === tool.id ? styles.toolCardActive : ""
            }`}
            key={tool.id}
            onClick={() => setActiveTool(tool.id)}
          >
            <span className={styles.toolTitle}>{tool.title}</span>
            <span className={styles.toolDescription}>{tool.description}</span>
            <span className={styles.toolAction}>Open tool →</span>
          </button>
        ))}
      </section>

      {loadError && <p className={styles.errorNotice}>{loadError}</p>}

      {activeTool === "home" && (
        <section className={styles.welcomePanel}>
          <p className={styles.eyebrow}>Email workspace</p>
          <h2>Choose what you want to do.</h2>
          <p>
            Use Send Email for one person, Campaigns for a selected group, Test
            Template before a send, and Templates to see what is currently
            registered in the CRM.
          </p>
        </section>
      )}

      {activeTool === "send" && (
        <section className={styles.toolPanel}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>One recipient</p>
              <h2>Send Email</h2>
            </div>
            <button
              type="button"
              className={styles.closeToolButton}
              onClick={() => setActiveTool("home")}
            >
              Close
            </button>
          </div>
          <HtmlEmailModal
            standalone
            onSent={() => setHtmlHistoryRefresh((value) => value + 1)}
          />
        </section>
      )}

      {activeTool === "campaigns" && (
        <section className={styles.toolPanel}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Selected contacts</p>
              <h2>Campaigns</h2>
            </div>
            <button
              type="button"
              className={styles.closeToolButton}
              onClick={() => setActiveTool("home")}
            >
              Close
            </button>
          </div>
          <EmailCampaignComposer
            contacts={contacts}
            templates={templates}
            config={config}
            fromEmail={selectedFromEmail || config.defaultFromEmail || "nick@nicholasegner.com"}
            onFromEmailChange={setSelectedFromEmail}
            loading={loading}
            onOpenTester={() => setActiveTool("test")}
            onSent={() =>
              setCampaignHistoryRefresh((value) => value + 1)
            }
          />
        </section>
      )}

      {activeTool === "test" && (
        <section className={styles.toolPanel}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Safe testing</p>
              <h2>Test Email Template</h2>
            </div>
            <button
              type="button"
              className={styles.closeToolButton}
              onClick={() => setActiveTool("home")}
            >
              Close
            </button>
          </div>
          <EmailTemplateTester
            templates={templates}
            config={config}
            fromEmail={selectedFromEmail || config.defaultFromEmail || "nick@nicholasegner.com"}
            onFromEmailChange={setSelectedFromEmail}
            loading={loading}
            onSent={() => setHtmlHistoryRefresh((value) => value + 1)}
          />
        </section>
      )}

      {activeTool === "templates" && (
        <section className={styles.toolPanel}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Template library</p>
              <h2>Templates</h2>
            </div>
            <button
              type="button"
              className={styles.closeToolButton}
              onClick={() => setActiveTool("home")}
            >
              Close
            </button>
          </div>
          <EmailTemplateLibrary templates={templates} loading={loading} />
        </section>
      )}

      <section className={styles.activitySection}>
        <div className={styles.activityHeading}>
          <p className={styles.eyebrow}>History</p>
          <h2>Email activity</h2>
        </div>

        <div className={styles.historyStack}>
          <ContactEmailActivity
            refreshKey={htmlHistoryRefresh + campaignHistoryRefresh}
            title="All Email Activity"
            description="Introduction, one-off, campaign, and test emails with Resend delivery events."
            emptyMessage="No CRM emails have been sent yet."
          />
          <EmailDashboard refreshKey={campaignHistoryRefresh} />
        </div>
      </section>
    </main>
  );
}

