const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const TRACKED_WEBSITE_URL =
  "https://nicholasegner.com/?utm_source=crm&utm_medium=email&utm_campaign=html_email";
const LOGO_URL =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/images/mail-logo.png";

function looksLikeFullCustomEmail(bodyHtml = "") {
  return /<!doctype\b|<html\b|<body\b/i.test(String(bodyHtml));
}

function injectPreheader(bodyHtml = "", preheader = "") {
  const safePreheader = escapeHtml(preheader);

  if (!safePreheader) return bodyHtml;

  const hiddenPreheader = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">${safePreheader}</div>`;

  if (/<body\b[^>]*>/i.test(bodyHtml)) {
    return bodyHtml.replace(
      /(<body\b[^>]*>)/i,
      `$1\n${hiddenPreheader}`,
    );
  }

  if (/<\/head>/i.test(bodyHtml)) {
    return bodyHtml.replace(/<\/head>/i, `</head>\n${hiddenPreheader}`);
  }

  return `${hiddenPreheader}\n${bodyHtml}`;
}

export function renderHtmlEmailShell({
  bodyHtml = "",
  preheader = "",
} = {}) {
  if (looksLikeFullCustomEmail(bodyHtml)) {
    return injectPreheader(bodyHtml, preheader);
  }

  const safePreheader = escapeHtml(preheader);
  const safeWebsiteUrl = escapeHtml(TRACKED_WEBSITE_URL);
  const safeLogoUrl = escapeHtml(LOGO_URL);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title></title>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2939;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">
      ${safePreheader}
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #e4e7ec;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:36px 38px 30px;font-size:16px;line-height:1.65;color:#1d2939;">
                ${bodyHtml}
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
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
