import styles from "../unsubscribe/unsubscribe.module.css";

export default function NewsletterTestPage() {
  return <main className={styles.page}><section className={styles.card}>
    <p className={styles.eyebrow}>Test newsletter</p>
    <h1>Unsubscribe preview</h1>
    <p>This is a test link. Nobody has been unsubscribed.</p>
    <p>Live newsletters include a signed unsubscribe link specific to each recipient.</p>
  </section></main>;
}
