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

    const personName =
      `${customerSelected.firstName || ""} ${customerSelected.lastName || ""}`.trim();
    const name =
      customerSelected.ownerType === "llc" && customerSelected.company?.name
        ? customerSelected.company.name
        : personName || customerSelected.company?.name || "this contact";

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

    const title = `Follow up with ${fullName}`;

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
      customerSelected.property?.street1
        ? `Property: ${[
            customerSelected.property.street1,
            customerSelected.property.city,
            customerSelected.property.state,
            customerSelected.property.zip,
          ]
            .filter(Boolean)
            .join(", ")}`
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

  const personName =
    `${customerSelected.firstName || ""} ${customerSelected.lastName || ""}`.trim();

  const fullName = customerSelected.ownerNameRaw
    ? customerSelected.ownerType === "couple" &&
      customerSelected.coOwnerName &&
      !customerSelected.ownerNameRaw.includes(customerSelected.coOwnerName)
      ? `${customerSelected.ownerNameRaw} & ${customerSelected.coOwnerName}`
      : customerSelected.ownerNameRaw
    : customerSelected.ownerType === "llc" && customerSelected.company?.name
      ? customerSelected.company.name
      : customerSelected.ownerType === "couple" && customerSelected.coOwnerName
        ? [personName, customerSelected.coOwnerName].filter(Boolean).join(" & ")
        : personName || customerSelected.company?.name || "Unnamed Contact";

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
              <h4>Project / Owner</h4>
              <p>Group this record and describe how the property is owned.</p>
            </div>

            <div className={styles.customerPanelGrid}>
              <label className={styles.customerPanelField}>
                <span>Owner / Entity Name</span>
                <input
                  type="text"
                  value={customerSelected.ownerNameRaw || ""}
                  onChange={(e) => updateContact({ ownerNameRaw: e.target.value })}
                  placeholder="Used for imported property-owner records"
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Project</span>
                <select
                  value={customerSelected.project || ""}
                  onChange={(e) => updateContact({ project: e.target.value })}
                >
                  <option value="">No project</option>
                  <option value="property-owner-outreach">Property Owner Outreach</option>
                </select>
              </label>

              <label className={styles.customerPanelField}>
                <span>Owner Type</span>
                <select
                  value={customerSelected.ownerType || "individual"}
                  onChange={(e) => updateContact({ ownerType: e.target.value })}
                >
                  <option value="individual">Individual</option>
                  <option value="couple">Couple</option>
                  <option value="llc">LLC / Entity</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className={styles.customerPanelField}>
                <span>Co-owner Name</span>
                <input
                  type="text"
                  value={customerSelected.coOwnerName || ""}
                  onChange={(e) => updateContact({ coOwnerName: e.target.value })}
                  placeholder="Optional second owner"
                />
              </label>
            </div>
          </section>

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
              <p>Organization and industry details.</p>
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
            </div>
          </section>

          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Mailing Address</h4>
              <p>Structured address fields for physical mail and future mail automation.</p>
            </div>

            <div className={styles.customerPanelGrid}>
              <label className={styles.customerPanelField}>
                <span>Address Line 1</span>
                <input
                  type="text"
                  value={customerSelected.address?.street1 || ""}
                  onChange={(e) =>
                    updateNested("address", { street1: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Address Line 2</span>
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
                <span>ZIP / Postal Code</span>
                <input
                  type="text"
                  value={customerSelected.address?.zip || ""}
                  onChange={(e) =>
                    updateNested("address", { zip: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Country</span>
                <input
                  type="text"
                  value={customerSelected.address?.country || ""}
                  onChange={(e) =>
                    updateNested("address", { country: e.target.value })
                  }
                  placeholder="US"
                />
              </label>
            </div>
          </section>

          <section className={styles.panelSection}>
            <div className={styles.panelSectionHeader}>
              <h4>Primary Property</h4>
              <p>The main property tied to this outreach record, separate from the owner mailing address.</p>
            </div>

            <div className={styles.customerPanelGrid}>
              <label className={styles.customerPanelField}>
                <span>Address Line 1</span>
                <input
                  type="text"
                  value={customerSelected.property?.street1 || ""}
                  onChange={(e) =>
                    updateNested("property", { street1: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Address Line 2</span>
                <input
                  type="text"
                  value={customerSelected.property?.street2 || ""}
                  onChange={(e) =>
                    updateNested("property", { street2: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>City</span>
                <input
                  type="text"
                  value={customerSelected.property?.city || ""}
                  onChange={(e) =>
                    updateNested("property", { city: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>State</span>
                <input
                  type="text"
                  value={customerSelected.property?.state || ""}
                  onChange={(e) =>
                    updateNested("property", { state: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>ZIP / Postal Code</span>
                <input
                  type="text"
                  value={customerSelected.property?.zip || ""}
                  onChange={(e) =>
                    updateNested("property", { zip: e.target.value })
                  }
                />
              </label>

              <label className={styles.customerPanelField}>
                <span>Country</span>
                <input
                  type="text"
                  value={customerSelected.property?.country || ""}
                  onChange={(e) =>
                    updateNested("property", { country: e.target.value })
                  }
                  placeholder="US"
                />
              </label>
            </div>

            {(customerSelected.properties || []).length > 1 && (
              <div className={styles.propertyPortfolio}>
                <div className={styles.propertyPortfolioHeader}>
                  <strong>Matching property portfolio</strong>
                  <span>{customerSelected.properties.length} properties</span>
                </div>

                {customerSelected.properties.map((property) => (
                  <div
                    className={styles.propertyPortfolioRow}
                    key={property.parcelId || property.street1}
                  >
                    <div>
                      <strong>
                        {[property.street1, property.city, property.state, property.zip]
                          .filter(Boolean)
                          .join(", ")}
                      </strong>
                      <span>
                        {property.numUnits || "—"} units
                        {property.yearBuilt ? ` · Built ${property.yearBuilt}` : ""}
                      </span>
                    </div>
                    <div>
                      <span>
                        {property.ownershipYears != null
                          ? `${property.ownershipYears} years since recorded sale`
                          : "Sale date unavailable"}
                      </span>
                      <small>Parcel {property.parcelId || "—"}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
