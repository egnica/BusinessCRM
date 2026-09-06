export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "48px" }}>
      <h1>CRM webhook receiver</h1>
      <p>This service accepts signed Resend webhook events for the private CRM.</p>
    </main>
  );
}
