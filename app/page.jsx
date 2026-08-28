"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import CustomerPanel from "./components/CustomerPanel";
import styles from "./page.module.css";

const getDateOnly = (dateStr) => (dateStr ? String(dateStr).slice(0, 10) : "");

const parseLocalDate = (dateStr) => {
  const value = getDateOnly(dateStr);
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
};

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

const formatDate = (dateStr) => {
  const date = parseLocalDate(dateStr);
  if (!date) return "—";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function Home() {
  const [contacts, setContacts] = useState([]);
  const [newUserToggle, setNewUserToggle] = useState(false);
  const [customerToggle, setCustomerToggle] = useState("");
  const [searchName, setSearchName] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dateFilter, setDateFilter] = useState("all");

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    jobTitle: "",
    email: "",
    companyName: "",
    linkedin: "",
    rank: "",
  });

  useEffect(() => {
    async function fetchContacts() {
      try {
        const res = await fetch("/api/contacts");
        const data = await res.json();
        setContacts(data.contacts || []);
      } catch (error) {
        console.error("Failed to fetch contacts:", error);
      }
    }

    fetchContacts();
  }, []);

  const getFollowUpStatus = (contact) => {
    const followUp = parseLocalDate(contact.nextFollowUp);
    if (!followUp) return "none";

    const today = startOfToday();
    const sevenDaysOut = new Date(today);
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

    if (followUp < today) return "overdue";
    if (followUp.getTime() === today.getTime()) return "today";
    if (followUp <= sevenDaysOut) return "upcoming";

    return "future";
  };

  const outreachStats = useMemo(() => {
    const stats = {
      total: contacts.length,
      overdue: 0,
      today: 0,
      upcoming: 0,
      none: 0,
    };

    contacts.forEach((contact) => {
      const status = getFollowUpStatus(contact);

      if (status === "overdue") stats.overdue += 1;
      if (status === "today") stats.today += 1;
      if (status === "upcoming") stats.upcoming += 1;
      if (status === "none") stats.none += 1;
    });

    return stats;
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    const query = searchName.trim().toLowerCase();

    return contacts
      .filter((contact) => {
        const haystack = [
          contact.firstName,
          contact.lastName,
          contact.jobTitle,
          contact.email,
          contact.company?.name,
          contact.company?.industry,
          contact.relationshipType,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchesSearch = !query || haystack.includes(query);
        if (!matchesSearch) return false;

        const status = getFollowUpStatus(contact);
        const followUp = parseLocalDate(contact.nextFollowUp);
        const today = startOfToday();

        if (dateFilter === "all") return true;
        if (dateFilter === "today") return status === "today";
        if (dateFilter === "upcoming") return status === "upcoming";
        if (dateFilter === "overdue") return status === "overdue";
        if (dateFilter === "none") return status === "none";
        if (dateFilter === "future") return Boolean(followUp && followUp >= today);

        return true;
      })
      .sort((a, b) => {
        const dateA = parseLocalDate(a.nextFollowUp);
        const dateB = parseLocalDate(b.nextFollowUp);

        if (!dateA && !dateB) {
          return `${a.lastName || ""}`.localeCompare(b.lastName || "");
        }
        if (!dateA) return 1;
        if (!dateB) return -1;

        return dateA - dateB;
      });
  }, [contacts, dateFilter, searchName]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredContacts.length - 1 ? prev + 1 : prev,
      );
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    }

    if (e.key === "Enter") {
      e.preventDefault();

      if (selectedIndex >= 0 && filteredContacts[selectedIndex]) {
        setCustomerToggle(filteredContacts[selectedIndex]._id);
      } else if (filteredContacts[0]) {
        setCustomerToggle(filteredContacts[0]._id);
      }
    }
  };

  const customerSelected = contacts.find((item) => item._id == customerToggle);

  function handleChange(e) {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const newContact = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      jobTitle: formData.jobTitle,
      email: formData.email,
      phone: "",
      company: {
        name: formData.companyName,
        website: "",
        industry: "",
      },
      address: {
        street1: "",
        street2: "",
        city: "",
        state: "",
        zip: "",
      },
      rank: formData.rank,
      relationshipType: "",
      facebook: "",
      linkedin: formData.linkedin,
      website: "",
      serviceInterest: [],
      birthday: null,
      notes: "",
      emailStatus: "subscribed",
      introEmail: {
        sent: false,
        sentAt: null,
      },
      lastContact: {
        date: null,
        type: "",
        notes: "",
      },
      nextFollowUp: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newContact),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error(data.error);
        return;
      }

      setFormData({
        firstName: "",
        lastName: "",
        jobTitle: "",
        email: "",
        companyName: "",
        linkedin: "",
        rank: "",
      });

      const refreshed = await fetch("/api/contacts");
      const refreshedData = await refreshed.json();
      setContacts(refreshedData.contacts || []);
      setNewUserToggle(false);
    } catch (error) {
      console.error("Failed to create contact:", error);
    }
  }

  useEffect(() => {
    if (customerToggle === "") return;

    const handleEscape = (e) => {
      if (e.key === "Escape") {
        setCustomerToggle("");
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [customerToggle]);

  const dashboardCards = [
    {
      label: "Due today",
      value: outreachStats.today,
      filter: "today",
      tone: "today",
      helper: "Follow-ups to handle now",
    },
    {
      label: "Overdue",
      value: outreachStats.overdue,
      filter: "overdue",
      tone: "overdue",
      helper: "Past-due follow-ups",
    },
    {
      label: "Next 7 days",
      value: outreachStats.upcoming,
      filter: "upcoming",
      tone: "upcoming",
      helper: "Upcoming relationship work",
    },
    {
      label: "No follow-up",
      value: outreachStats.none,
      filter: "none",
      tone: "neutral",
      helper: "Contacts without a next step",
    },
  ];

  const filterOptions = [
    ["all", "All"],
    ["today", "Today"],
    ["upcoming", "Next 7 Days"],
    ["future", "Future"],
    ["overdue", "Overdue"],
    ["none", "No Follow-up"],
  ];

  return (
    <main className={styles.pageShell}>
      <section className={styles.topSection}>
        <div className={styles.appHeader}>
          <div>
            <p className={styles.eyebrow}>Relationship workspace</p>
            <h1>Business CRM</h1>
            <p className={styles.headerDescription}>
              Keep contacts, follow-ups, and outreach activity in one place.
            </p>
          </div>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setNewUserToggle((prev) => !prev)}
          >
            {newUserToggle ? "Close Form" : "+ New Contact"}
          </button>
        </div>

        <div className={styles.dashboardPanel}>
          <div className={styles.dashboardHeading}>
            <div>
              <p className={styles.eyebrow}>Outreach dashboard</p>
              <h2>At a glance</h2>
            </div>
            <div className={styles.totalContacts}>
              <span>{outreachStats.total}</span>
              <small>Total contacts</small>
            </div>
          </div>

          <div className={styles.dashboardGrid}>
            {dashboardCards.map((card) => (
              <button
                type="button"
                key={card.label}
                className={`${styles.metricCard} ${styles[`metric_${card.tone}`]}`}
                onClick={() => {
                  setDateFilter(card.filter);
                  setSelectedIndex(-1);
                }}
              >
                <span className={styles.metricValue}>{card.value}</span>
                <span className={styles.metricLabel}>{card.label}</span>
                <span className={styles.metricHelper}>{card.helper}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {newUserToggle && (
        <form className={styles.mainRecordFormContain} onSubmit={handleSubmit}>
          <div className={styles.formHeader}>
            <div>
              <p className={styles.eyebrow}>New record</p>
              <h2>Add a contact</h2>
              <p>Start with the essentials. More details can be added later.</p>
            </div>
          </div>

          <div className={styles.formGrid}>
            <label>
              <span>First name</span>
              <input
                name="firstName"
                placeholder="First name"
                value={formData.firstName}
                onChange={handleChange}
                autoComplete="given-name"
                required
              />
            </label>

            <label>
              <span>Last name</span>
              <input
                name="lastName"
                placeholder="Last name"
                value={formData.lastName}
                onChange={handleChange}
                autoComplete="family-name"
                required
              />
            </label>

            <label>
              <span>Job title</span>
              <input
                name="jobTitle"
                placeholder="Job title"
                value={formData.jobTitle}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                name="email"
                placeholder="name@company.com"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
              />
            </label>

            <label>
              <span>Company</span>
              <input
                name="companyName"
                placeholder="Company name"
                value={formData.companyName}
                onChange={handleChange}
                autoComplete="organization"
              />
            </label>

            <label>
              <span>LinkedIn</span>
              <input
                name="linkedin"
                placeholder="LinkedIn URL"
                value={formData.linkedin}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>Rank</span>
              <select
                name="rank"
                value={formData.rank || ""}
                onChange={handleChange}
              >
                <option value="">Select rank</option>
                <option value="A">A — Priority</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </label>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setNewUserToggle(false)}
            >
              Cancel
            </button>
            <button type="submit" className={styles.primaryButton}>
              Add Contact
            </button>
          </div>
        </form>
      )}

      <section className={styles.contactsSection}>
        <div className={styles.contactsHeading}>
          <div>
            <p className={styles.eyebrow}>Contact directory</p>
            <h2>Contacts</h2>
          </div>
          <span className={styles.resultCount}>
            {filteredContacts.length} shown
          </span>
        </div>

        <div className={styles.toolbar}>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search contacts</span>
            <input
              type="search"
              value={searchName}
              onChange={(e) => {
                setSearchName(e.target.value);
                setSelectedIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search name, company, title, email..."
            />
          </label>

          <div className={styles.filterGroup} aria-label="Follow-up filters">
            {filterOptions.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={dateFilter === value ? styles.filterActive : ""}
                onClick={() => {
                  setDateFilter(value);
                  setSelectedIndex(-1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.contactTable}>
          <div className={styles.contactTableHeader}>
            <span>Contact</span>
            <span>Company / Role</span>
            <span>Rank</span>
            <span>Last Contact</span>
            <span>Next Follow-up</span>
            <span>Links</span>
          </div>

          <div className={styles.customerContain}>
            {filteredContacts.map((contact, index) => {
              const status = getFollowUpStatus(contact);
              const statusLabel = {
                overdue: "Overdue",
                today: "Today",
                upcoming: "Next 7 days",
                future: "Scheduled",
                none: "No follow-up",
              }[status];

              return (
                <div
                  className={`${styles.customerListItem} ${
                    selectedIndex === index ? styles.selectedRow : ""
                  }`}
                  data-status={status}
                  key={contact._id}
                >
                  <div className={styles.contactCell}>
                    <button
                      type="button"
                      className={styles.contactName}
                      onClick={() => setCustomerToggle(contact._id)}
                    >
                      {contact.firstName} {contact.lastName}
                    </button>
                    <a
                      className={styles.emailLink}
                      href={contact.email ? `mailto:${contact.email}` : undefined}
                    >
                      {contact.email || "No email"}
                    </a>
                  </div>

                  <div className={styles.companyCell}>
                    <strong>{contact.company?.name || "—"}</strong>
                    <span>{contact.jobTitle || contact.relationshipType || "—"}</span>
                  </div>

                  <div>
                    <span
                      className={`${styles.rankBadge} ${
                        styles[`rank${contact.rank || "None"}`]
                      }`}
                    >
                      {contact.rank || "—"}
                    </span>
                  </div>

                  <div className={styles.dateCell}>
                    <span>{formatDate(contact.lastContact?.date)}</span>
                    <small>{contact.lastContact?.type || ""}</small>
                  </div>

                  <div className={styles.dateCell}>
                    <span>{formatDate(contact.nextFollowUp)}</span>
                    <small
                      className={`${styles.statusBadge} ${styles[`status_${status}`]}`}
                    >
                      {statusLabel}
                    </small>
                  </div>

                  <div className={styles.socials}>
                    {contact.company?.website && (
                      <a
                        className={styles.iconLink}
                        href={contact.company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${contact.company?.name || "company"} website`}
                        title="Company website"
                      >
                        ↗
                      </a>
                    )}
                    {contact.linkedin && (
                      <a
                        className={styles.iconLink}
                        href={contact.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open LinkedIn"
                        title="LinkedIn"
                      >
                        <Image
                          width={20}
                          height={20}
                          alt=""
                          src="/icons/linkedin.svg"
                        />
                      </a>
                    )}
                    {contact.facebook && (
                      <a
                        className={styles.iconLink}
                        href={contact.facebook}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open Facebook"
                        title="Facebook"
                      >
                        <Image
                          width={20}
                          height={20}
                          alt=""
                          src="/icons/facebook.svg"
                        />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredContacts.length === 0 && (
              <div className={styles.emptyState}>
                <strong>No contacts match this view.</strong>
                <span>Try a different search or follow-up filter.</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {customerToggle !== "" && customerSelected && (
        <CustomerPanel
          customerSelected={customerSelected}
          setContacts={setContacts}
          setCustomerToggle={setCustomerToggle}
        />
      )}
    </main>
  );
}
