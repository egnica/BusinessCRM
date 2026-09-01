"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import CustomerPanel from "./components/CustomerPanel";
import EmailDashboard from "./components/EmailDashboard";
import IntroEmailModal from "./components/IntroEmailModal";
import NewsletterModal from "./components/NewsletterModal";
import PropertyOwnerWorkspace from "./components/PropertyOwnerWorkspace";
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

const getIntroEmailStatus = (contact) => {
  if (contact?.introEmail?.status) return contact.introEmail.status;
  if (contact?.introEmail?.sent) return "sent";
  return "pending";
};

const getContactDisplayName = (contact) => {
  const personName =
    `${contact.firstName || ""} ${contact.lastName || ""}`.trim();

  if (contact.ownerNameRaw) {
    if (
      contact.ownerType === "couple" &&
      contact.coOwnerName &&
      !contact.ownerNameRaw.includes(contact.coOwnerName)
    ) {
      return `${contact.ownerNameRaw} & ${contact.coOwnerName}`;
    }

    return contact.ownerNameRaw;
  }

  if (contact.ownerType === "llc" && contact.company?.name) {
    return contact.company.name;
  }

  if (contact.ownerType === "couple" && contact.coOwnerName) {
    return [personName, contact.coOwnerName].filter(Boolean).join(" & ");
  }

  return personName || contact.company?.name || "Unnamed Contact";
};

export default function Home() {
  const [contacts, setContacts] = useState([]);
  const [newUserToggle, setNewUserToggle] = useState(false);
  const [customerToggle, setCustomerToggle] = useState("");
  const [searchName, setSearchName] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dateFilter, setDateFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [workspace, setWorkspace] = useState("crm");
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [introEmailContactId, setIntroEmailContactId] = useState("");
  const [emailHistoryOpen, setEmailHistoryOpen] = useState(false);
  const [emailHistoryRefresh, setEmailHistoryRefresh] = useState(0);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    ownerType: "individual",
    coOwnerName: "",
    project: "",
    jobTitle: "",
    email: "",
    phone: "",
    companyName: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    propertyStreet1: "",
    propertyStreet2: "",
    propertyCity: "",
    propertyState: "",
    propertyZip: "",
    propertyCountry: "US",
    linkedin: "",
    rank: "",
  });

  const refreshContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/contacts", { cache: "no-store" });
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (error) {
      console.error("Failed to fetch contacts:", error);
    }
  }, []);

  useEffect(() => {
    refreshContacts();
  }, [refreshContacts]);

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

  const subscribedEmailCount = useMemo(
    () =>
      new Set(
        contacts
          .filter(
            (contact) =>
              contact.email && contact.emailStatus === "subscribed",
          )
          .map((contact) => String(contact.email).trim().toLowerCase())
          .filter(Boolean),
      ).size,
    [contacts],
  );

  const unsubscribedEmailCount = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          contact.email && contact.emailStatus === "unsubscribed",
      ).length,
    [contacts],
  );

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
          contact.ownerNameRaw,
          contact.project,
          contact.ownerType,
          contact.coOwnerName,
          contact.address?.street1,
          contact.address?.street2,
          contact.address?.city,
          contact.address?.state,
          contact.address?.zip,
          contact.property?.street1,
          contact.property?.street2,
          contact.property?.city,
          contact.property?.state,
          contact.property?.zip,
          ...(contact.properties || []).flatMap((property) => [
            property.street1,
            property.city,
            property.state,
            property.zip,
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const matchesSearch = !query || haystack.includes(query);
        if (!matchesSearch) return false;

        if (projectFilter !== "all" && contact.project !== projectFilter) {
          return false;
        }

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
          return getContactDisplayName(a).localeCompare(getContactDisplayName(b));
        }
        if (!dateA) return 1;
        if (!dateB) return -1;

        return dateA - dateB;
      });
  }, [contacts, dateFilter, projectFilter, searchName]);

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
  const introEmailContact = contacts.find(
    (item) => item._id == introEmailContactId,
  );

  async function handleCancelIntro(contact) {
    if (!contact?._id) return;

    const name = getContactDisplayName(contact);
    const confirmed = window.confirm(
      `Cancel the introduction email for ${name}?`,
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/contacts/${contact._id}/intro-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();

      if (!res.ok) {
        window.alert(data.error || "Could not cancel the introduction email.");
        return;
      }

      setContacts((prev) =>
        prev.map((item) =>
          item._id === contact._id
            ? { ...item, introEmail: data.introEmail }
            : item,
        ),
      );
    } catch (error) {
      console.error("Cancel intro email error:", error);
      window.alert("Could not cancel the introduction email.");
    }
  }

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
      ownerType: formData.ownerType,
      coOwnerName: formData.coOwnerName,
      project: formData.project,
      jobTitle: formData.jobTitle,
      email: formData.email,
      phone: formData.phone,
      company: {
        name: formData.companyName,
        website: "",
        industry: "",
      },
      address: {
        street1: formData.street1,
        street2: formData.street2,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        country: formData.country,
      },
      property: {
        street1: formData.propertyStreet1,
        street2: formData.propertyStreet2,
        city: formData.propertyCity,
        state: formData.propertyState,
        zip: formData.propertyZip,
        country: formData.propertyCountry,
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
        status: "pending",
        sent: false,
        sentAt: null,
        cancelledAt: null,
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
        ownerType: "individual",
        coOwnerName: "",
        project: "",
        jobTitle: "",
        email: "",
        phone: "",
        companyName: "",
        street1: "",
        street2: "",
        city: "",
        state: "",
        zip: "",
        country: "US",
        propertyStreet1: "",
        propertyStreet2: "",
        propertyCity: "",
        propertyState: "",
        propertyZip: "",
        propertyCountry: "US",
        linkedin: "",
        rank: "",
      });

      await refreshContacts();
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

  if (workspace === "property-owners") {
    return (
      <PropertyOwnerWorkspace
        onBack={() => setWorkspace("crm")}
        onContactPromoted={refreshContacts}
      />
    );
  }

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

          <div className={styles.appHeaderActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setWorkspace("property-owners")}
            >
              Property Owners
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setNewUserToggle((prev) => !prev)}
            >
              {newUserToggle ? "Close Form" : "+ New Contact"}
            </button>
          </div>
        </div>

        <div className={styles.emailOutreachPanel}>
          <div>
            <p className={styles.eyebrow}>Email outreach</p>
            <h2>Newsletter</h2>
            <p className={styles.emailOutreachDescription}>
              Send updates to subscribed contacts and review campaign history.
            </p>
          </div>

          <div className={styles.emailOutreachStats}>
            <div className={styles.emailOutreachStat}>
              <strong>{subscribedEmailCount}</strong>
              <span>Subscribed</span>
            </div>
            <div className={styles.emailOutreachStat}>
              <strong>{unsubscribedEmailCount}</strong>
              <span>Unsubscribed</span>
            </div>
          </div>

          <div className={styles.emailOutreachActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setEmailHistoryOpen((prev) => !prev)}
            >
              {emailHistoryOpen ? "Hide Email History" : "Email History"}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => setNewsletterOpen(true)}
            >
              Send Newsletter
            </button>
          </div>
        </div>
      </section>

      <section className={styles.dashboardPanel}>
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
      </section>

      {emailHistoryOpen && (
        <EmailDashboard refreshKey={emailHistoryRefresh} />
      )}

      {newUserToggle && (
        <form className={styles.mainRecordFormContain} onSubmit={handleSubmit}>
          <div className={styles.formHeader}>
            <div>
              <p className={styles.eyebrow}>New record</p>
              <h2>Add a contact</h2>
              <p>Add the contact details you know, including a mailing address when available.</p>
            </div>
          </div>

          <div className={styles.formGrid}>
            <label>
              <span>Project</span>
              <select
                name="project"
                value={formData.project}
                onChange={handleChange}
              >
                <option value="">No project</option>
                <option value="property-owner-outreach">Property Owner Outreach</option>
              </select>
            </label>

            <label>
              <span>Owner type</span>
              <select
                name="ownerType"
                value={formData.ownerType}
                onChange={handleChange}
              >
                <option value="individual">Individual</option>
                <option value="couple">Couple</option>
                <option value="llc">LLC / Entity</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label>
              <span>First name</span>
              <input
                name="firstName"
                placeholder="First name"
                value={formData.firstName}
                onChange={handleChange}
                autoComplete="given-name"
                required={formData.ownerType !== "llc"}
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
                required={formData.ownerType !== "llc"}
              />
            </label>

            {formData.ownerType === "couple" && (
              <label>
                <span>Co-owner name</span>
                <input
                  name="coOwnerName"
                  placeholder="Full name of second owner"
                  value={formData.coOwnerName}
                  onChange={handleChange}
                />
              </label>
            )}

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
              <span>Phone</span>
              <input
                type="tel"
                name="phone"
                placeholder="Phone number"
                value={formData.phone}
                onChange={handleChange}
                autoComplete="tel"
              />
            </label>

            <label>
              <span>{formData.ownerType === "llc" ? "LLC / Entity name" : "Company"}</span>
              <input
                name="companyName"
                placeholder={formData.ownerType === "llc" ? "LLC or entity name" : "Company name"}
                value={formData.companyName}
                onChange={handleChange}
                autoComplete="organization"
                required={formData.ownerType === "llc"}
              />
            </label>

            <label>
              <span>Address line 1</span>
              <input
                name="street1"
                placeholder="Street address"
                value={formData.street1}
                onChange={handleChange}
                autoComplete="address-line1"
              />
            </label>

            <label>
              <span>Address line 2</span>
              <input
                name="street2"
                placeholder="Apartment, suite, unit, etc."
                value={formData.street2}
                onChange={handleChange}
                autoComplete="address-line2"
              />
            </label>

            <label>
              <span>City</span>
              <input
                name="city"
                placeholder="City"
                value={formData.city}
                onChange={handleChange}
                autoComplete="address-level2"
              />
            </label>

            <label>
              <span>State</span>
              <input
                name="state"
                placeholder="State"
                value={formData.state}
                onChange={handleChange}
                autoComplete="address-level1"
              />
            </label>

            <label>
              <span>ZIP / Postal code</span>
              <input
                name="zip"
                placeholder="ZIP / Postal code"
                value={formData.zip}
                onChange={handleChange}
                autoComplete="postal-code"
              />
            </label>

            <label>
              <span>Country</span>
              <input
                name="country"
                placeholder="US"
                value={formData.country}
                onChange={handleChange}
                autoComplete="country"
              />
            </label>

            <label>
              <span>Property address line 1</span>
              <input
                name="propertyStreet1"
                placeholder="Target property street address"
                value={formData.propertyStreet1}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>Property address line 2</span>
              <input
                name="propertyStreet2"
                placeholder="Unit or suite"
                value={formData.propertyStreet2}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>Property city</span>
              <input
                name="propertyCity"
                placeholder="City"
                value={formData.propertyCity}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>Property state</span>
              <input
                name="propertyState"
                placeholder="State"
                value={formData.propertyState}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>Property ZIP</span>
              <input
                name="propertyZip"
                placeholder="ZIP"
                value={formData.propertyZip}
                onChange={handleChange}
              />
            </label>

            <label>
              <span>Property country</span>
              <input
                name="propertyCountry"
                placeholder="US"
                value={formData.propertyCountry}
                onChange={handleChange}
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
              placeholder="Search name, company, address, project..."
            />
          </label>

          <label className={styles.projectFilter}>
            <span className={styles.srOnly}>Project filter</span>
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setSelectedIndex(-1);
              }}
            >
              <option value="all">All projects</option>
              <option value="property-owner-outreach">Property Owner Outreach</option>
            </select>
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
            <span>Company / Context</span>
            <span>Rank</span>
            <span>Last Contact</span>
            <span>Next Follow-up</span>
            <span>Intro</span>
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
              const introStatus = getIntroEmailStatus(contact);

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
                      {getContactDisplayName(contact)}
                    </button>
                    <a
                      className={styles.emailLink}
                      href={contact.email ? `mailto:${contact.email}` : undefined}
                    >
                      {contact.email || "No email"}
                    </a>
                    {contact.email && (
                      <span
                        className={`${styles.emailStatusBadge} ${
                          contact.emailStatus === "unsubscribed"
                            ? styles.emailStatusUnsubscribed
                            : styles.emailStatusSubscribed
                        }`}
                      >
                        {contact.emailStatus === "unsubscribed"
                          ? "Unsubscribed"
                          : "Subscribed"}
                      </span>
                    )}
                  </div>

                  <div className={styles.companyCell}>
                    <strong>
                      {contact.project === "property-owner-outreach"
                        ? contact.property?.street1 || contact.company?.name || "—"
                        : contact.company?.name || "—"}
                    </strong>
                    <span>
                      {contact.project === "property-owner-outreach"
                        ? [
                            contact.ownerType === "llc"
                              ? "LLC / Entity"
                              : contact.ownerType === "couple"
                                ? "Couple"
                                : "Individual",
                            (contact.properties || []).length > 1
                              ? `${contact.properties.length} matching properties`
                              : contact.relationshipType,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : contact.jobTitle || contact.relationshipType || "—"}
                    </span>
                    {contact.project === "property-owner-outreach" && (
                      <span>Property Owner Outreach</span>
                    )}
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

                  <div className={styles.introEmailCell}>
                    {introStatus === "sent" ? (
                      <>
                        <span
                          className={
                            styles.introEmailBadge + " " + styles.introEmailSent
                          }
                        >
                          Intro Sent
                        </span>
                        <small>{formatDate(contact.introEmail?.sentAt)}</small>
                      </>
                    ) : introStatus === "cancelled" ? (
                      <span
                        className={
                          styles.introEmailBadge +
                          " " +
                          styles.introEmailCancelled
                        }
                      >
                        Cancelled
                      </span>
                    ) : (
                      <div className={styles.introEmailRowActions}>
                        <button
                          type="button"
                          className={styles.introSendButton}
                          onClick={() => setIntroEmailContactId(contact._id)}
                          disabled={
                            !contact.email ||
                            contact.emailStatus !== "subscribed"
                          }
                          title={
                            !contact.email
                              ? "Add an email address first"
                              : contact.emailStatus !== "subscribed"
                                ? "Contact is not subscribed"
                                : "Preview and send introduction email"
                          }
                        >
                          Send Intro
                        </button>
                        <button
                          type="button"
                          className={styles.introCancelButton}
                          onClick={() => handleCancelIntro(contact)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
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

      {newsletterOpen && (
        <NewsletterModal
          recipientCount={subscribedEmailCount}
          onClose={() => setNewsletterOpen(false)}
          onSent={() => {
            setEmailHistoryRefresh((prev) => prev + 1);
            setEmailHistoryOpen(true);
          }}
        />
      )}

      {introEmailContactId !== "" && introEmailContact && (
        <IntroEmailModal
          contact={introEmailContact}
          onClose={() => setIntroEmailContactId("")}
          onSent={(introEmail) => {
            setContacts((prev) =>
              prev.map((contact) =>
                contact._id === introEmailContact._id
                  ? { ...contact, introEmail }
                  : contact,
              ),
            );
            setIntroEmailContactId("");
          }}
        />
      )}

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
