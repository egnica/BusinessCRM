const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const TRACKED_WEBSITE_URL =
  "https://nicholasegner.com/?utm_source=crm&utm_medium=email&utm_campaign=intro_email";
const LOGO_URL =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/images/mail-logo.png";

const introductionEmail = {
  id: "introduction-email",
  name: "Introduction / Hello",
  subject: "Hello from Nicholas Egner",
  render({ recipientName = "there", unsubscribeUrl = "#" } = {}) {
    const name = escapeHtml(recipientName || "there");
    const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);
    const safeWebsiteUrl = escapeHtml(TRACKED_WEBSITE_URL);
    const safeLogoUrl = escapeHtml(LOGO_URL);

    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2939;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e4e7ec;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:36px 38px 30px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Hi ${name},</p>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  I wanted to introduce myself and say hello.
                </p>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  I’m Nicholas Egner. I work across web development, video, digital strategy, and automation, helping businesses improve how they communicate, market themselves, and operate.
                </p>

                <p style="margin:0 0 24px;font-size:16px;line-height:1.65;">
                  I’m always building, experimenting, and looking for better ways to solve problems.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 26px;">
                  <tr>
                    <td>
                      <a href="${safeWebsiteUrl}" style="display:inline-block;padding:11px 16px;border:1px solid #d0d5dd;border-radius:8px;color:#1d2939;text-decoration:none;font-size:14px;font-weight:700;">
                        See what I’m working on →
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  Glad to be connected.
                </p>

                <p style="margin:0;font-size:16px;line-height:1.65;">
                  Thanks,<br />
                  Nicholas
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 38px;background:#f9fafb;border-top:1px solid #eaecf0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="145" valign="middle" style="padding-right:22px;">
                      <a href="${safeWebsiteUrl}" style="text-decoration:none;">
                        <img src="${safeLogoUrl}" width="120" alt="Nicholas Egner" style="display:block;width:120px;max-width:100%;height:auto;border:0;" />
                      </a>
                    </td>
                    <td valign="middle" style="font-size:13px;line-height:1.65;color:#667085;">
                      <strong style="color:#1d2939;font-size:14px;">Nicholas Egner</strong><br />
                      <a href="mailto:nick@nicholasegner.com" style="color:#475467;text-decoration:none;">nick@nicholasegner.com</a><br />
                      <a href="${safeWebsiteUrl}" style="color:#475467;">Website</a>
                      &nbsp;|&nbsp;
                      <a href="https://www.linkedin.com/in/nicholas-egner" style="color:#475467;">LinkedIn</a>
                      &nbsp;|&nbsp;
                      <a href="https://latestartdev.com/" style="color:#475467;">Blog</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #eaecf0;font-size:11px;line-height:1.55;color:#98a2b3;">
                  You’re receiving this because we’ve connected or you’re in my business contact list.
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

export default introductionEmail;
