export function getNewsletterFromAddress() {
  const value = String(process.env.RESEND_FROM_EMAIL || "").trim();

  if (!value) return "";
  if (value.includes("<") && value.includes(">")) return value;

  return `Nicholas Egner <${value}>`;
}

export function getNewsletterConfigStatus() {
  const resendConfigured = Boolean(
    process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL,
  );
  const unsubscribeConfigured = Boolean(process.env.UNSUBSCRIBE_SECRET);

  return {
    configured: resendConfigured && unsubscribeConfigured,
    resendConfigured,
    unsubscribeConfigured,
    fromEmail: String(process.env.RESEND_FROM_EMAIL || "").trim(),
  };
}
