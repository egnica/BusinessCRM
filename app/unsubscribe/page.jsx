import { ObjectId } from "mongodb";
import clientPromise from "@/lib/mongodb";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import UnsubscribeForm from "./UnsubscribeForm";
import styles from "./unsubscribe.module.css";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }) {
  const params = await searchParams;
  const token = params?.token || "";
  const decoded = verifyUnsubscribeToken(token);

  if (
    !decoded ||
    !ObjectId.isValid(decoded.contactId) ||
    !ObjectId.isValid(decoded.sendId)
  ) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Email preferences</p>
          <h1>Unable to unsubscribe</h1>
          <p>This unsubscribe link is invalid.</p>
        </section>
      </main>
    );
  }

  const client = await clientPromise;
  const db = client.db("crm");
  const contact = await db.collection("contacts").findOne({
    _id: new ObjectId(decoded.contactId),
  });

  if (!contact) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>Email preferences</p>
          <h1>Unable to unsubscribe</h1>
          <p>We could not find this contact.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        {contact.emailStatus === "unsubscribed" ? (
          <>
            <p className={styles.eyebrow}>Email preferences</p>
            <h1>You’re already unsubscribed.</h1>
            <p>
              {contact.firstName ? `${contact.firstName}, you` : "You"} will
              not receive newsletter emails from this list.
            </p>
          </>
        ) : (
          <UnsubscribeForm
            token={token}
            firstName={contact.firstName || ""}
          />
        )}
      </section>
    </main>
  );
}
