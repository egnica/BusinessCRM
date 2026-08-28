import crypto from "crypto";

function getSecret() {
  const secret = process.env.UNSUBSCRIBE_SECRET;

  if (!secret) {
    throw new Error("UNSUBSCRIBE_SECRET is not configured");
  }

  return secret;
}

export function createUnsubscribeToken(contactId, sendId) {
  const payload = `${contactId}:${sendId}`;
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");

  return Buffer.from(
    JSON.stringify({
      contactId: String(contactId),
      sendId: String(sendId),
      signature,
    }),
  ).toString("base64url");
}

export function verifyUnsubscribeToken(token) {
  try {
    const decoded = JSON.parse(
      Buffer.from(String(token || ""), "base64url").toString("utf8"),
    );

    const payload = `${decoded.contactId}:${decoded.sendId}`;
    const expected = crypto
      .createHmac("sha256", getSecret())
      .update(payload)
      .digest("hex");

    const suppliedBuffer = Buffer.from(decoded.signature || "", "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      return null;
    }

    return {
      contactId: decoded.contactId,
      sendId: decoded.sendId,
    };
  } catch {
    return null;
  }
}
