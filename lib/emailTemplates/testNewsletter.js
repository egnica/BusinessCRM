const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const testNewsletter = {
  id: "test-newsletter",
  name: "CRM Test Newsletter",
  subject: "A quick test from my CRM",
  render({ recipientName = "there", unsubscribeUrl = "#" } = {}) {
    const name = escapeHtml(recipientName || "there");
    const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);

    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2939;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e4e7ec;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:34px 36px;">
                <p style="margin:0 0 10px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#667085;font-weight:700;">Nicholas Egner</p>
                <h1 style="margin:0 0 20px;font-size:28px;line-height:1.2;">The CRM email system is working.</h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">Hi ${name},</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  This is a test newsletter sent from the Business CRM. If you are reading this, the template, delivery, and tracking pipeline are connected correctly.
                </p>
                <p style="margin:0;font-size:16px;line-height:1.65;">
                  Future emails can use this same system with different templates.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 36px;background:#f9fafb;border-top:1px solid #eaecf0;font-size:12px;line-height:1.5;color:#667085;">
                You are receiving this email because you are in my business contact list.<br />
                <a href="${safeUnsubscribeUrl}" style="color:#475467;">Unsubscribe</a>
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

export default testNewsletter;
