export const EMAIL_REPLY_TO = "nick@nicholasegner.com";

const INTRO_FROM_EMAIL = "nick@nicholasegner.com";

export function getIntroductionFromAddress() {
  return `Nicholas Egner <${INTRO_FROM_EMAIL}>`;
}

export function getIntroductionFromEmail() {
  return INTRO_FROM_EMAIL;
}

export function getNewsletterFromAddress() {
  const value = String(process.env.RESEND_FROM_EMAIL || INTRO_FROM_EMAIL).trim();
  if (value.includes("<") && value.includes(">")) return value;

  return `Nicholas Egner <${value}>`;
}

export function getNewsletterSenderOptions() {
  const configured = String(process.env.RESEND_FROM_EMAIL || "").trim();
  const configuredEmail = (configured.match(/<([^<>]+)>$/)?.[1] || configured)
    .trim().toLowerCase();
  return Array.from(new Set([
    INTRO_FROM_EMAIL,
    "hello@nicholasegner.com",
    configuredEmail,
  ].filter(Boolean)));
}

export function resolveNewsletterSender(value) {
  const email = value === undefined ? INTRO_FROM_EMAIL :
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!getNewsletterSenderOptions().includes(email)) {
    throw new Error("Choose an available sender address.");
  }
  return { email, address: `Nicholas Egner <${email}>` };
}

export function getNewsletterConfigStatus() {
  const resendConfigured = Boolean(
    String(process.env.RESEND_API_KEY || "").trim(),
  );
  const unsubscribeConfigured = Boolean(String(process.env.UNSUBSCRIBE_SECRET || "").trim());

  return {
    configured: resendConfigured && unsubscribeConfigured,
    resendConfigured,
    unsubscribeConfigured,
    fromEmail: String(process.env.RESEND_FROM_EMAIL || INTRO_FROM_EMAIL).trim(),
    defaultFromEmail: INTRO_FROM_EMAIL,
    senderOptions: getNewsletterSenderOptions(),
    introFromEmail: INTRO_FROM_EMAIL,
    setupIssues: [
      ...(!resendConfigured ? ["Add RESEND_API_KEY to the hosting environment and redeploy."] : []),
      ...(!unsubscribeConfigured ? ["Add UNSUBSCRIBE_SECRET to the hosting environment and redeploy."] : []),
    ],
  };
}

