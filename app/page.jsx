async function getContacts() {
  const res = await fetch("http://localhost:3000/api/contacts", {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch contacts");
  }

  return res.json();
}

export default async function Home() {
  const data = await getContacts();
  const contacts = data.contacts;

  return (
    <main style={{ padding: "20px" }}>
      <h1>Business CRM</h1>
      <h2>Contacts</h2>

      {contacts.length === 0 ? (
        <p>No contacts found.</p>
      ) : (
        <ul>
          {contacts.map((contact) => (
            <li key={contact._id}>
              <strong>
                {contact.firstName} {contact.lastName}
              </strong>{" "}
              - {contact.relationshipType} - Rank {contact.rank}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
