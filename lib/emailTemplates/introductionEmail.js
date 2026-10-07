const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const WHO_HERO_URL =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/images/who.gif";
const WHO_ARE_YOU_URL = "https://nicholasegner.com/who-are-you";
const PROJECTS_URL =
  "https://nicholasegner.com/projects?utm_source=crm&utm_medium=email&utm_campaign=intro_email";
const VIDEO_URL =
  "https://nicholasegner.com/video?utm_source=crm&utm_medium=email&utm_campaign=intro_email";
const WEBSITE_URL =
  "https://nicholasegner.com/?utm_source=crm&utm_medium=email&utm_campaign=intro_email";
const LOGO_URL =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/images/mail-logo.png";

const introductionEmail = {
  id: "introduction-email",
  name: "Introduction / Hello",
  subject: "Hello from Nicholas Egner",
  render({ recipientName = "there", trackingId = "", unsubscribeUrl = "#" } = {}) {
    const rawName = String(recipientName || "").trim();
    const firstName = rawName ? rawName.split(/\s+/)[0] : "there";
    const rawTrackingId = String(trackingId || "").trim().toUpperCase();
    const hasTrackingId = /^NE-[A-HJ-NP-Z2-9]{8}$/.test(rawTrackingId);
    const name = escapeHtml(firstName);
    const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);
    const safeHeroUrl = escapeHtml(WHO_HERO_URL);
    const safeWebsiteUrl = escapeHtml(WEBSITE_URL);
    const safeProjectsUrl = escapeHtml(PROJECTS_URL);
    const safeVideoUrl = escapeHtml(VIDEO_URL);
    const safeLogoUrl = escapeHtml(LOGO_URL);
    const welcomeQuery = hasTrackingId
      ? `id=${encodeURIComponent(rawTrackingId)}`
      : `name=${encodeURIComponent(firstName)}`;
    const personalizedWelcomeUrl = escapeHtml(
      `${WHO_ARE_YOU_URL}?${welcomeQuery}&utm_source=crm&utm_medium=email&utm_campaign=intro_email`,
    );

    return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2939;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e4e7ec;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:0;">
                <a href="${personalizedWelcomeUrl}" style="display:block;text-decoration:none;">
                  <img
                    src="${safeHeroUrl}"
                    width="620"
                    alt="Who are you? Welcome to Nicholas Egner's introduction page."
                    style="display:block;width:100%;max-width:620px;height:auto;border:0;"
                  />
                </a>
              </td>
            </tr>

            <tr>
              <td style="padding:32px 38px 30px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Hi ${name},</p>

                <p style="margin:0 0 14px;font-size:16px;line-height:1.65;">
                  I wanted to introduce myself and say hello.
                </p>

                <p style="margin:0 0 14px;font-size:20px;line-height:1.4;font-weight:700;color:#101828;">
                  Who am I?
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 26px;">
                  <tr>
                    <td>
                      <a href="${personalizedWelcomeUrl}" style="display:inline-block;padding:11px 16px;border:1px solid #d0d5dd;border-radius:8px;color:#1d2939;text-decoration:none;font-size:14px;font-weight:700;">
                        Welcome Page →
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  I’m Nicholas Egner. I build websites, produce video, and spend a probably unreasonable amount of time figuring out better ways to make technology actually useful for small businesses.
                </p>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  A lot of the work I do starts with me noticing something that feels clunky, outdated, or harder than it needs to be and thinking, “There has to be a better way to do this.”
                </p>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  Sometimes that turns into a new website. Sometimes it’s a video project, an automation, a custom tool, or just connecting a few pieces that should have been working together in the first place.
                </p>

                <p style="margin:0 0 24px;font-size:16px;line-height:1.65;">
                  If you’re curious, you can check out some of my
                  <a href="${safeProjectsUrl}" style="color:#3448c5;text-decoration:underline;">website work</a>
                  or
                  <a href="${safeVideoUrl}" style="color:#3448c5;text-decoration:underline;">video projects</a>,
                  or just take a look at what I’ve been building lately.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 26px;">
                  <tr>
                    <td>
                      <a href="${safeProjectsUrl}" style="display:inline-block;padding:11px 16px;border:1px solid #d0d5dd;border-radius:8px;color:#1d2939;text-decoration:none;font-size:14px;font-weight:700;">
                        See what I’m working on →
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  I’m always interested in meeting people doing interesting things, especially other small business owners and people building something of their own. If something I do ever overlaps with something you’re working on, I’d love to hear about it.
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
