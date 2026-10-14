const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const CTA_GIF_URL =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/images/see-what-i-madeBTN.gif";
const WELCOME_URL = "https://nicholasegner.com/who-are-you";
const WEBSITE_URL = "https://nicholasegner.com/";
const LOGO_URL =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/images/mail-logo.png";

const followUpClickEmail = {
  id: "follow-up-click-email",
  name: "Follow-Up | Click-Through",
  subject: "An introduction you can actually play",
  render({ recipientName = "there", trackingId = "", unsubscribeUrl = "#" } = {}) {
    const rawName = String(recipientName || "").trim();
    const firstName = rawName ? rawName.split(/\s+/)[0] : "there";
    const name = escapeHtml(firstName);
    const rawTrackingId = String(trackingId || "").trim().toUpperCase();
    const hasTrackingId = /^NE-[A-HJ-NP-Z2-9]{8}$/.test(rawTrackingId);
    const welcomeQuery = hasTrackingId
      ? `id=${encodeURIComponent(rawTrackingId)}`
      : `name=${encodeURIComponent(firstName)}`;
    const personalizedWelcomeUrl = escapeHtml(
      `${WELCOME_URL}?${welcomeQuery}&utm_source=crm&utm_medium=email&utm_campaign=follow_up_click_email`,
    );
    const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);

    return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2939;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e4e7ec;border-radius:12px;">
            <tr>
              <td style="padding:32px 34px 22px;">
                <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">${name},</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  I wanted to show you a little more of what I build.
                </p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.65;">
                  I put together an interactive introduction with a small adventure game that uses your name. It’s a fun example of the custom experiences I can build alongside websites, video, and content tools.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="padding:2px 0 12px;">
                      <a href="${personalizedWelcomeUrl}" style="display:inline-block;text-decoration:none;" title="See the interactive introduction">
                        <img src="${CTA_GIF_URL}" width="280" alt="See what I made. Play the personalized interactive introduction." style="display:block;width:100%;max-width:280px;height:auto;border:0;" />
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:8px 0 22px;font-size:13px;line-height:1.5;text-align:center;">
                  <a href="${personalizedWelcomeUrl}" style="color:#3448c5;text-decoration:underline;">See the interactive introduction →</a>
                </p>
                <p style="margin:0;font-size:16px;line-height:1.65;">Thanks,<br />Nicholas</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 34px;background:#f9fafb;border-top:1px solid #eaecf0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="140" valign="middle" style="padding-right:16px;">
                      <a href="${WEBSITE_URL}" style="text-decoration:none;">
                        <img src="${LOGO_URL}" alt="Nicholas Egner" width="115" style="display:block;width:115px;max-width:100%;height:auto;border:0;" />
                      </a>
                    </td>
                    <td valign="middle" style="font-size:13px;line-height:1.65;color:#667085;">
                      <strong style="color:#1d2939;">Nicholas Egner</strong><br />
                      <a href="mailto:nick@nicholasegner.com" style="color:#475467;">nick@nicholasegner.com</a><br />
                      <a href="${WEBSITE_URL}" style="color:#475467;">Website</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #eaecf0;font-size:11px;line-height:1.5;color:#98a2b3;">
                  You're receiving this email because you're in my business contact list.
                  <a href="${safeUnsubscribeUrl}" style="color:#667085;">Unsubscribe</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  },
};

export default followUpClickEmail;
