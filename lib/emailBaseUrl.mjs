export const DEFAULT_EMAIL_BASE_URL =
  "https://main.dcjjjb8rwkdsk.amplifyapp.com";

function isLocalHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host === "[::]" ||
    host.startsWith("127.")
  );
}

// Amplify's server request URL can be localhost even for public requests.
// Never use that internal origin for links sent to recipients.
export function getEmailBaseUrl({
  appBaseUrl = process.env.APP_BASE_URL,
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  const configured = String(appBaseUrl || "").trim();
  if (!configured) return DEFAULT_EMAIL_BASE_URL;

  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("APP_BASE_URL must be a valid absolute URL");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("APP_BASE_URL must be an HTTP(S) origin without a path or credentials");
  }

  // Recover from a development URL accidentally left in production settings.
  if (isLocalHostname(url.hostname) && nodeEnv !== "development") {
    return DEFAULT_EMAIL_BASE_URL;
  }

  if (nodeEnv !== "development" && url.protocol !== "https:") {
    throw new Error("APP_BASE_URL must use HTTPS outside development");
  }

  return url.origin;
}
