"use client";
import styles from "./page.module.css";
import Image from "next/image";
import { useEffect, useState } from "react";
import CustomerPanel from "./components/CustomerPanel";

export default function Home() {
  const [contacts, setContacts] = useState([]);
  const [newUserToggle, setNewUserToggle] = useState(false);
  const [customerToggle, setCustomerToggle] = useState("");

  const customerSelected = contacts.find((item) => item._id == customerToggle);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    jobTitle: "",
    email: "",
    companyName: "",
    rank: "",
  });

  useEffect(() => {
    async function fetchContacts() {
      try {
        const res = await fetch("/api/contacts");
        const data = await res.json();
        setContacts(data.contacts);
      } catch (error) {
        console.error("Failed to fetch contacts:", error);
      }
    }

    fetchContacts();
  }, []);

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
      setContacts(refreshedData.contacts);
    } catch (error) {
      console.error("Failed to create contact:", error);
    }
  }

  return (
    <main>
      <h1>Business CRM</h1>
      <div
        className={styles.addContactBtn}
        onClick={() => setNewUserToggle(!newUserToggle)}
      >
        <h2>New Contact</h2>
      </div>
      <br />
{newUserToggle && (
  <form
    className={styles.mainRecordFormContain}
    onSubmit={handleSubmit}
  >
    <div className={styles.formHeader}>
      <h2>Add New Contact</h2>
      <p>Enter the basic contact details below.</p>
    </div>

    <div className={styles.formGrid}>
      <input
        name="firstName"
        placeholder="First Name"
        value={formData.firstName}
        onChange={handleChange}
        autoComplete="given-name"
      />

      <input
        name="lastName"
        placeholder="Last Name"
        value={formData.lastName}
        onChange={handleChange}
        autoComplete="family-name"
      />

      <input
        name="jobTitle"
        placeholder="Job Title"
        value={formData.jobTitle}
        onChange={handleChange}
      />

      <input
        type="email"
        name="email"
        placeholder="Email"
        value={formData.email}
        onChange={handleChange}
        autoComplete="email"
      />

      <input
        name="companyName"
        placeholder="Company Name"
        value={formData.companyName}
        onChange={handleChange}
        autoComplete="organization"
      />

      <input
        name="linkedin"
        placeholder="LinkedIn URL"
        value={formData.linkedin}
        onChange={handleChange}
      />

      <select
        name="rank"
        value={formData.rank || ""}
        onChange={handleChange}
      >
        <option value="">Select rank</option>
        <option value="A">A</option>
        <option value="B">B</option>
        <option value="C">C</option>
        <option value="D">D</option>
      </select>
    </div>

    <div className={styles.formActions}>
      <button type="submit">Add Contact</button>
    </div>
  </form>
)}

      <h2>Contacts</h2>
      <div className={styles.customerContain}>
        {contacts.map((contact) => (
          <div className={styles.customerListItem} key={contact._id}>
            <div
              className={styles.contactName}
              onClick={() => setCustomerToggle(contact._id)}
            >
              {contact.nextFollowUp &&
              new Date(contact.nextFollowUp).setHours(0, 0, 0, 0) >=
                new Date().setHours(0, 0, 0, 0) ? (
                <span>**</span>
              ) : null}
              {contact.firstName} {contact.lastName}
            </div>
            <div
              style={
                contact.rank == "A"
                  ? { color: "blue" }
                  : contact.rank == "B"
                    ? { color: "green" }
                    : contact.rank == "C"
                      ? { color: "red" }
                      : { color: "black" }
              }
            >
              Rank: {contact.rank}
            </div>

            <div>
              {contact.jobTitle} :{" "}
              {contact.company?.website ? (
                <a
                  href={contact.company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {contact.company?.name}
                </a>
              ) : (
                contact.company?.name
              )}
            </div>

            <a href={`mailto:${contact.email}`}>
              <div>{contact.email}</div>
            </a>
            <div>
              Last: {contact.lastContact.date ? contact.lastContact.date : "--"}
            </div>
            <div>
              Follow: {contact.nextFollowUp ? contact.nextFollowUp : "--"}
            </div>

            <div className={styles.socials}>
              {contact.facebook && (
                <a href={contact.facebook} target="_blank">
                  <Image
                    width={40}
                    height={40}
                    alt="facebook"
                    src="/icons/facebook.svg"
                  />
                </a>
              )}
              {contact.linkedin && (
                <a href={contact.linkedin} target="_blank">
                  <Image
                    width={40}
                    height={40}
                    alt="facebook"
                    src="/icons/linkedin.svg"
                  />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      {customerToggle !== "" && customerSelected && (
        <>
          <CustomerPanel
            customerSelected={customerSelected}
            setContacts={setContacts}
            setCustomerToggle={setCustomerToggle}
          />
        </>
      )}
    </main>
  );
}
