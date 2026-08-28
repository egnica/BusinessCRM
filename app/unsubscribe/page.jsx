import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import styles from "./unsubscribe.module.css";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }) {
  const params = await searchParams;
  const decoded = verifyUnsubscribeToken(params?.token);

  if (
    !decoded ||
    !ObjectId.isValid(decoded.contactId) ||
    !ObjectId.isValid(decoded.sendId)
  ) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>Unable to unsubscribe</h1>
          <p>This unsubscribe link is invalid or has expired.</p>
        </section>
      </main>
    );
  }

  const client = await clientPromise;
  const db = client.db("crm");
  const contactId = new ObjectId(decoded.contactId);
  const sendId = new ObjectId(decoded.sendId);
  const now = new Date();

  const contact = await db.collection("contacts").findOne({ _id: contactId });

  if (!contact) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <h1>Unable to unsubscribe</h1>
          <p>We could not find this contact.</p>
        </section>
      </main>
    );
  }

  await db.collection("contacts").updateOne(
    { _id: contactId },
    {
      $set: {
        emailStatus: "unsubscribed",
        unsubscribedAt: now,
        updatedAt: now,
      },
    },
  );

  const recipientUpdate = await db.collection("newsletterRecipients").updateOne(
    {
      sendId,
      contactId,
      unsubscribedAt: null,
    },
    {
      $set: {
        status: "unsubscribed",
        unsubscribedAt: now,
        updatedAt: now,
      },
    },
  );

  if (recipientUpdate.modifiedCount > 0) {
    await db.collection("newsletterSends").updateOne(
      { _id: sendId },
      {
        $inc: { unsubscribeCount: 1 },
        $set: { updatedAt: now },
      },
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Email preferences</p>
        <h1>You’re unsubscribed.</h1>
        <p>
          {contact.firstName ? `${contact.firstName}, you` : "You"} will no longer
          receive newsletter emails from this list.
        </p>
      </section>
    </main>
  );
}
