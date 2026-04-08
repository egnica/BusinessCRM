// CustomerPanel.jsx

import React from "react";
import styles from "../page.module.css";

function CustomerPanel({ customerSelected, setContacts, setCustomerToggle }) {
  const handleDelete = async () => {
    if (!customerSelected?._id) return;

    const confirmed = window.confirm(
      `Delete ${customerSelected.name}? This cannot be undone.`,
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
      console.log("SAVE response:", data);

      if (!res.ok) {
        console.error(data.error || "Failed to update contact");
        return;
      }

      // REFRESH DATA
      const refreshed = await fetch("/api/contacts");
      const refreshedData = await refreshed.json();
      setContacts(refreshedData.contacts);

      setCustomerToggle("");
    } catch (error) {
      console.error("Failed to save contact:", error);
    }
  }

  return (
    <div className={styles.customerPanelContain}>
      <div className={styles.customerPanelHeader}>
        <h3>
          {customerSelected.firstName} {customerSelected.lastName}
        </h3>
        <button
          type="button"
          className={styles.customerPanelClose}
          onClick={() => setCustomerToggle("")}
        >
          Close
        </button>
        <button onClick={handleDelete}>Delete Contact</button>
      </div>
      <div className={styles.customerPanelScroll}>
        <div className={styles.customerPanelGrid}>
          <label className={styles.customerPanelField}>
            <span>First Name</span>
            <input
              type="text"
              value={customerSelected.firstName || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, firstName: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Last Name</span>
            <input
              type="text"
              value={customerSelected.lastName || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, lastName: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Job Title</span>
            <input
              type="text"
              value={customerSelected.jobTitle || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, jobTitle: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Email</span>
            <input
              type="text"
              value={customerSelected.email || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, email: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Phone</span>
            <input
              type="text"
              value={customerSelected.phone || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, phone: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Rank</span>
            <select
              style={{ width: "45px", height: "44px", textAlign: "center" }}
              value={customerSelected.rank || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, rank: e.target.value }
                      : contact,
                  ),
                )
              }
            >
              <option value="">Select rank</option>
              <option value="A">A</option>
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
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, relationshipType: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Birthday</span>
            <input
              type="text"
              value={customerSelected.birthday || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, birthday: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Company Name</span>
            <input
              type="text"
              value={customerSelected.company?.name || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          company: {
                            ...contact.company,
                            name: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Company Website</span>
            <input
              type="text"
              value={customerSelected.company?.website || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          company: {
                            ...contact.company,
                            website: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Company Industry</span>
            <input
              type="text"
              value={customerSelected.company?.industry || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          company: {
                            ...contact.company,
                            industry: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Street 1</span>
            <input
              type="text"
              value={customerSelected.address?.street1 || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          address: {
                            ...contact.address,
                            street1: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Street 2</span>
            <input
              type="text"
              value={customerSelected.address?.street2 || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          address: {
                            ...contact.address,
                            street2: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>City</span>
            <input
              type="text"
              value={customerSelected.address?.city || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          address: {
                            ...contact.address,
                            city: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>State</span>
            <input
              type="text"
              value={customerSelected.address?.state || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          address: {
                            ...contact.address,
                            state: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Zip</span>
            <input
              type="text"
              value={customerSelected.address?.zip || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          address: {
                            ...contact.address,
                            zip: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Facebook</span>
            <input
              type="text"
              value={customerSelected.facebook || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, facebook: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>LinkedIn</span>
            <input
              type="text"
              value={customerSelected.linkedin || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, linkedin: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Website</span>
            <input
              type="text"
              value={customerSelected.website || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, website: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Email Status</span>
            <input
              type="text"
              value={customerSelected.emailStatus || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, emailStatus: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Intro Email Sent</span>
            <input
              type="text"
              value={String(customerSelected.introEmail?.sent ?? "")}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          introEmail: {
                            ...contact.introEmail,
                            sent: e.target.value === "true",
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Intro Email Sent At</span>
            <input
              type="text"
              value={customerSelected.introEmail?.sentAt || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          introEmail: {
                            ...contact.introEmail,
                            sentAt: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Last Contact Date</span>
            <input
              type="date"
              value={customerSelected.lastContact?.date || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          lastContact: {
                            ...contact.lastContact,
                            date: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Last Contact Type</span>
            <input
              type="text"
              value={customerSelected.lastContact?.type || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          lastContact: {
                            ...contact.lastContact,
                            type: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label
            className={`${styles.customerPanelField} ${styles.customerPanelFull}`}
          >
            <span>Last Contact Notes</span>
            <textarea
              rows="4"
              value={customerSelected.lastContact?.notes || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          lastContact: {
                            ...contact.lastContact,
                            notes: e.target.value,
                          },
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label className={styles.customerPanelField}>
            <span>Next Follow Up</span>
            <input
              type="date"
              value={customerSelected.nextFollowUp || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, nextFollowUp: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label
            className={`${styles.customerPanelField} ${styles.customerPanelFull}`}
          >
            <span>Service Interest (comma separated)</span>
            <input
              type="text"
              value={(customerSelected.serviceInterest || []).join(", ")}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? {
                          ...contact,
                          serviceInterest: e.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean),
                        }
                      : contact,
                  ),
                )
              }
            />
          </label>

          <label
            className={`${styles.customerPanelField} ${styles.customerPanelFull}`}
          >
            <span>Notes</span>
            <textarea
              rows="6"
              value={customerSelected.notes || ""}
              onChange={(e) =>
                setContacts((prev) =>
                  prev.map((contact) =>
                    contact._id === customerSelected._id
                      ? { ...contact, notes: e.target.value }
                      : contact,
                  ),
                )
              }
            />
          </label>
        </div>
        <div className={styles.customerPanelFooter}>
          <button
            type="button"
            className={styles.customerPanelSave}
            onClick={handleSaveCustomer}
          >
            Save
          </button>
        </div>
        <br />
        <br />
      </div>
    </div>
  );
}

export default CustomerPanel;
