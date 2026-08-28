// CustomerPanel.jsx

import React, { useState } from "react";
import styles from "../page.module.css";

function CustomerPanel({ customerSelected, setContacts, setCustomerToggle }) {
  const [calendarFormOpen, setCalendarFormOpen] = useState(false);

  const updateContact = (patch) => {
    setContacts((prev) =>
      prev.map((contact) =>
        contact._id === customerSelected._id
          ? { ...contact, ...patch }
          : contact,
      ),
    );
  };

  const updateNested = (key, patch) => {
    setContacts((prev) =>
      prev.map((contact) =>
        contact._id === customerSelected._id
          ? {
              ...contact,
              [key]: {
                ...(contact[key] || {}),
                ...patch,
              },
            }
          : contact,
      ),
    );
  };

  const handleDelete = async () => {
    if (!customerSelected?._id) return;

    const name =
      `${customerSelected.firstName || ""} ${customerSelected.lastName || ""}`.trim() ||
      "this contact";

    const confirmed = window.confirm(
      `Delete ${name}? This cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      const res = await fetch(`/api/contacts/${customerSelected._id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete contact");
      }

      setContacts((prev) =>
        prev.filter((contact) => contact._id !== customerSelected._id),
      );
      setCustomerToggle("");
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  async function handleSaveCustomer() {
    if (!customerSelected) return;

    try {
      const { _id, ...rest } = customerSelected;

      const res = await fetch(`/api/contacts/${_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...rest,
          updatedAt: new Date().toISOString(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error(data.error || "Failed to update contact");
        return;
      }

      const refreshed = await fetch("/api/contacts");
      const refreshedData = await refreshed.json();
      setContacts(refreshedData.contacts || []);
      setCustomerToggle("");
    } catch (error) {
      console.error("Failed to save contact:", error);
    }
  }

  const buildGoogleCalendarLink = () => {
    if (!customerSelected?.nextFollowUp) return "#";

    const title =
      `Follow up with ${customerSelected.firstName || ""} ${customerSelected.lastName || ""}`.trim();

    const baseDate = new Date(customerSelected.nextFollowUp);
    baseDate.setHours(9, 0, 0, 0);

    const endDate = new Date(baseDate);
    endDate.setMinutes(endDate.getMinutes() + 15);

    const formatGoogleDate = (date) => {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      const seconds = String(date.getUTCSeconds()).padStart(2, "0");

      return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
    };

    const start = formatGoogleDate(baseDate);
    const end = formatGoogleDate(endDate);

    const details = [
      customerSelected.email ? `Email: ${customerSelected.email}` : "",
      customerSelected.company?.name
        ? `Company: ${customerSelected.company.name}`
        : "",
      customerSelected.notes ? `Notes: ${customerSelected.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    return (
      "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      `&text=${encodeURIComponent(title)}` +
      `&dates=${start}/${end}` +
      `&details=${encodeURIComponent(details)}`
    );
  };

  const fullName =
    `${customerSelected.firstName || ""} ${customerSelected.lastName || ""}`.trim();

  return (
    <>
      <div
        className={styles.panelBackdrop}
        onClick={() => setCustomerToggle("")}
        aria-hidden="true"
      />

      <aside className={styles.customerPanelContain} aria-label="Contact details">
        <div className={styles.customerPanelHeader}>
          <div className={styles.customerPanelHeaderTop}>
            <div>
              <p className={styles.eyebrow}>Contact record</p>
              <h3>{fullName || "Unnamed Contact"}</h3>
              <p className={styles.panelSubtitle}>
                {[customerSelected.jobTitle, customerSelected.company?.name]
                  .filter(Boolean)
                  .join(" · ") || "No role or company added"}
              </p>
            </div>

            <div className={styles.panelHeaderActions}>
              <button
                type="button"
                className={styles.customerPanelClose}
                onClick={() => setCustomerToggle("")}
              >
                Close
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <div className={styles.customerPanelScroll}>
          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Contact</h4>
              <p>Core identity and contact information.</p>
            </div>

            <div className={styles.customerPanelGrid}>
              <label className={styles.customerPanelField}>
                <span>First Name</span>
                <input
                  type="text"
                  value={customerSelected.firstName || ""}
                  onChange={(e) => updateContact({ firstName: e.target.value })}
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Last Name</span>
                <input
                  type="text"
                  value={customerSelected.lastName || ""}
                  onChange={(e) => updateContact({ lastName: e.target.value })}
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Job Title</span>
                <input
                  type="text"
                  value={customerSelected.jobTitle || ""}
                  onChange={(e) => updateContact({ jobTitle: e.target.value })}
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Email</span>
                <input
                  type="email"
                  value={customerSelected.email || ""}
                  onChange={(e) => updateContact({ email: e.target.value })}
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Phone</span>
                <input
                  type="text"
                  value={customerSelected.phone || ""}
                  onChange={(e) => updateContact({ phone: e.target.value })}
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Rank</span>
                <select
                  value={customerSelected.rank || ""}
                  onChange={(e) => updateContact({ rank: e.target.value })}
                >
                  <option value="">Select rank</option>
                  <option value="A">A — Priority</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
              </label>

              <label className={styles.customerPanelField}>
                <span>Relationship Type</span>
                <input
                  type="text"
                  value={customerSelected.relationshipType || ""}
                  onChange={(e) =>
                    updateContact({ relationshipType: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Birthday</span>
                <input
                  type="text"
                  value={customerSelected.birthday || ""}
                  onChange={(e) => updateContact({ birthday: e.target.value })}
                  placeholder="Optional"
                />
              </label>
            </div>
          </section>

          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Company</h4>
              <p>Organization, industry, and address details.</p>
            </div>

            <div className={styles.customerPanelGrid}>
              <label className={styles.customerPanelField}>
                <span>Company Name</span>
                <input
                  type="text"
                  value={customerSelected.company?.name || ""}
                  onChange={(e) => updateNested("company", { name: e.target.value })}
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Company Website</span>
                <input
                  type="text"
                  value={customerSelected.company?.website || ""}
                  onChange={(e) =>
                    updateNested("company", { website: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Company Industry</span>
                <input
                  type="text"
                  value={customerSelected.company?.industry || ""}
                  onChange={(e) =>
                    updateNested("company", { industry: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Personal / Portfolio Website</span>
                <input
                  type="text"
                  value={customerSelected.website || ""}
                  onChange={(e) => updateContact({ website: e.target.value })}
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Street 1</span>
                <input
                  type="text"
                  value={customerSelected.address?.street1 || ""}
                  onChange={(e) =>
                    updateNested("address", { street1: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Street 2</span>
                <input
                  type="text"
                  value={customerSelected.address?.street2 || ""}
                  onChange={(e) =>
                    updateNested("address", { street2: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>City</span>
                <input
                  type="text"
                  value={customerSelected.address?.city || ""}
                  onChange={(e) =>
                    updateNested("address", { city: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>State</span>
                <input
                  type="text"
                  value={customerSelected.address?.state || ""}
                  onChange={(e) =>
                    updateNested("address", { state: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Zip</span>
                <input
                  type="text"
                  value={customerSelected.address?.zip || ""}
                  onChange={(e) =>
                    updateNested("address", { zip: e.target.value })
                  }
                />
              </label>
            </div>
          </section>

          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Online Profiles</h4>
              <p>Useful links for research and relationship context.</p>
            </div>

            <div className={styles.customerPanelGrid}>
              <label className={styles.customerPanelField}>
                <span>LinkedIn</span>
                <input
                  type="text"
                  value={customerSelected.linkedin || ""}
                  onChange={(e) => updateContact({ linkedin: e.target.value })}
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Facebook</span>
                <input
                  type="text"
                  value={customerSelected.facebook || ""}
                  onChange={(e) => updateContact({ facebook: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Outreach</h4>
              <p>Track email status, contact history, and the next follow-up.</p>
            </div>

            <div className={styles.customerPanelGrid}>
              <label className={styles.customerPanelField}>
                <span>Email Status</span>
                <select
                  value={customerSelected.emailStatus || "unknown"}
                  onChange={(e) => updateContact({ emailStatus: e.target.value })}
                >
                  <option value="subscribed">Subscribed</option>
                  <option value="unsubscribed">Unsubscribed</option>
                  <option value="unknown">Unknown</option>
                  <option value="pending">Pending</option>
                </select>
              </label>

              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  checked={Boolean(customerSelected.introEmail?.sent)}
                  onChange={(e) =>
                    updateNested("introEmail", { sent: e.target.checked })
                  }
                />
                Intro email sent
              </label>

              <label className={styles.customerPanelField}>
                <span>Intro Email Sent At</span>
                <input
                  type="text"
                  value={customerSelected.introEmail?.sentAt || ""}
                  onChange={(e) =>
                    updateNested("introEmail", { sentAt: e.target.value })
                  }
                  placeholder="Timestamp or date"
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Last Contact Date</span>
                <input
                  type="date"
                  value={customerSelected.lastContact?.date || ""}
                  onChange={(e) =>
                    updateNested("lastContact", { date: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Last Contact Type</span>
                <input
                  type="text"
                  value={customerSelected.lastContact?.type || ""}
                  onChange={(e) =>
                    updateNested("lastContact", { type: e.target.value })
                  }
                  placeholder="Email, call, meeting..."
                />
              </label>

              <div className={styles.followUpActions}>
                <label className={styles.customerPanelField}>
                  <span>Next Follow Up</span>
                  <input
                    type="date"
                    value={customerSelected.nextFollowUp || ""}
                    onChange={(e) =>
                      updateContact({ nextFollowUp: e.target.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  className={styles.calendarButton}
                  disabled={!customerSelected.nextFollowUp}
                  onClick={() => setCalendarFormOpen((prev) => !prev)}
                >
                  Calendar
                </button>
              </div>

              <label
                className={`${styles.customerPanelField} ${styles.customerPanelFull}`}
              >
                <span>Last Contact Notes</span>
                <textarea
                  rows="4"
                  value={customerSelected.lastContact?.notes || ""}
                  onChange={(e) =>
                    updateNested("lastContact", { notes: e.target.value })
                  }
                />
              </label>

              {calendarFormOpen && customerSelected.nextFollowUp && (
                <div className={styles.calendarCard}>
                  <div className={styles.calendarGrid}>
                    <label className={styles.calendarField}>
                      <span>Event Title</span>
                      <input
                        type="text"
                        defaultValue={`Follow up with ${fullName}`}
                        readOnly
                      />
                    </label>

                    <label className={styles.calendarField}>
                      <span>Date</span>
                      <input
                        type="date"
                        defaultValue={customerSelected.nextFollowUp.split("T")[0]}
                        readOnly
                      />
                    </label>

                    <label className={styles.calendarField}>
                      <span>Time</span>
                      <input type="time" defaultValue="09:00" readOnly />
                    </label>

                    <a
                      href={buildGoogleCalendarLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.calendarCreateButton}
                    >
                      Open Google Calendar
                    </a>
                  </div>
                </div>
              )}

              <label
                className={`${styles.customerPanelField} ${styles.customerPanelFull}`}
              >
                <span>Service Interest</span>
                <input
                  type="text"
                  value={(customerSelected.serviceInterest || []).join(", ")}
                  onChange={(e) =>
                    updateContact({
                      serviceInterest: e.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Comma separated"
                />
              </label>
            </div>
          </section>

          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Notes</h4>
              <p>Relationship context, ideas, and anything worth remembering.</p>
            </div>

            <div className={styles.customerPanelGrid}>
              <label
                className={`${styles.customerPanelField} ${styles.customerPanelFull}`}
              >
                <span>Notes</span>
                <textarea
                  rows="7"
                  value={customerSelected.notes || ""}
                  onChange={(e) => updateContact({ notes: e.target.value })}
                />
              </label>
            </div>
          </section>
        </div>

        <div className={styles.customerPanelFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setCustomerToggle("")}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.customerPanelSave}
            onClick={handleSaveCustomer}
          >
            Save Changes
          </button>
        </div>
      </aside>
    </>
  );
}

export default CustomerPanel;
