const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const VIDEO_URL =
  "https://nicholasegner.com/video?utm_source=crm&utm_medium=email&utm_campaign=video_outreach";
const INTERACTIVE_VIDEO_URL =
  "https://nicholasegner.com/video-experience?utm_source=crm&utm_medium=email&utm_campaign=video_outreach";
const WEBSITE_URL =
  "https://nicholasegner.com/?utm_source=crm&utm_medium=email&utm_campaign=video_outreach";
const LOGO_URL =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/images/mail-logo.png";

// Exact three posts, titles, thumbnails, and URLs from introductionEmail.js.
const RECENT_POSTS = [
  {
    id: "015",
    title: "Building My Own Social Media Hub",
    image:
      "https://latestartbucket.s3.us-east-2.amazonaws.com/mobile-phone/Untitled-October-05-2026-at-12.37-1791236736341-4b31a8f6.webp",
    url: "https://nicholasegner.com/blog/building-my-own-social-media-hub?utm_source=crm&utm_medium=email&utm_campaign=intro_email&utm_content=blog_014",
  },
  {
    id: "013",
    title: "How a Video Can Transform a Business’s Online Presence",
    image:
      "https://nciholasegner.s3.us-east-2.amazonaws.com/images/yourGardens-Thumb.webp",
    url: "https://nicholasegner.com/blog/your-gardens-by-design-video?utm_source=crm&utm_medium=email&utm_campaign=intro_email&utm_content=blog_013",
  },
  {
    id: "012",
    title: "The Video SEO Trifecta: How to Use YouTube for Business SEO",
    image:
      "https://nciholasegner.s3.us-east-2.amazonaws.com/images/video_seo_thumbnail.png",
    url: "https://nicholasegner.com/blog/video-seo-trifecta?utm_source=crm&utm_medium=email&utm_campaign=intro_email&utm_content=blog_012",
  },
];

const videoOutreachEmail = {
  id: "video-outreach-email",
  name: "Video Outreach / Opportunities",
  subject: "Video Editor & Producer in Minneapolis | Nicholas Egner",
  render({ recipientName = "there", unsubscribeUrl = "#" } = {}) {
    const rawName = String(recipientName || "").trim();
    const firstName = rawName ? rawName.split(/\s+/)[0] : "there";
    const name = escapeHtml(firstName);
    const safeUnsubscribeUrl = escapeHtml(unsubscribeUrl);
    const safeWebsiteUrl = escapeHtml(WEBSITE_URL);
    const safeVideoUrl = escapeHtml(VIDEO_URL);
    const safeInteractiveVideoUrl = escapeHtml(INTERACTIVE_VIDEO_URL);
    const safeLogoUrl = escapeHtml(LOGO_URL);
    const safeRecentPosts = RECENT_POSTS.map((post) => ({
      ...post,
      title: escapeHtml(post.title),
      image: escapeHtml(post.image),
      url: escapeHtml(post.url),
    }));
    // Preserved from the Introduction / Hello template verbatim.
    const recentPostsHtml = safeRecentPosts
      .map(
        (post, index) => `
                  <td class="recent-post-column" width="33.33%" valign="top" style="width:33.33%;padding:${index === 0 ? "0 8px 0 0" : index === safeRecentPosts.length - 1 ? "0 0 0 8px" : "0 4px"};">
                    <a href="${post.url}" style="display:block;text-decoration:none;">
                      <img
                        class="recent-post-image"
                        src="${post.image}"
                        width="170"
                        alt="${post.title}"
                        style="display:block;width:100%;max-width:170px;height:auto;border:0;border-radius:8px;"
                      />
                    </a>
                    <p style="margin:10px 0 0;font-size:13px;line-height:1.4;font-weight:700;">
                      <a href="${post.url}" style="color:#1d2939;text-decoration:none;">${post.title}</a>
                    </p>
                  </td>`,
      )
      .join("");

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Video Editor &amp; Producer in Minneapolis</title>
    <style>
      @media only screen and (max-width: 520px) {
        .recent-post-column {
          display: block !important;
          width: 100% !important;
          padding: 0 0 20px !important;
        }

        .recent-post-image {
          max-width: 100% !important;
        }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2939;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;line-height:1px;font-size:1px;">
      Exploring video editing and production opportunities in the Twin Cities.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e4e7ec;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:32px 38px 30px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.65;">Hi ${name},</p>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  I'm Nicholas Egner, a Minneapolis-based video editor and producer.
                </p>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  I've worked on a variety of projects over the years, including event and social media content for the YWCA, video projects for Landscape Structures, and video and podcast production for Barlow Research.
                </p>

                <p style="margin:0 0 24px;font-size:16px;line-height:1.65;">
                  I'm currently exploring new opportunities in video editing and production, whether that's helping with individual projects or becoming part of a team.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                  <tr>
                    <td>
                      <a href="${safeVideoUrl}" style="display:inline-block;padding:11px 16px;border:1px solid #d0d5dd;border-radius:8px;color:#1d2939;text-decoration:none;font-size:14px;font-weight:700;">
                        View My Video Work →
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 16px;font-size:16px;line-height:1.65;">
                  I also created an <a href="${safeInteractiveVideoUrl}" style="color:#3448c5;text-decoration:underline;">interactive video experience</a> that tells a little more of my story, if you're curious.
                </p>

                <p style="margin:0 0 24px;font-size:16px;line-height:1.65;">
                  If you have any upcoming projects or opportunities where my experience could be useful, I'd love to connect.
                </p>

                <p style="margin:0;font-size:16px;line-height:1.65;">
                  Thanks,<br />
                  Nicholas
                </p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:30px 0 0;border-top:1px solid #eaecf0;">
                  <tr>
                    <td colspan="3" style="padding:24px 0 14px;">
                      <p style="margin:0;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#667085;">
                        Recent posts
                      </p>
                    </td>
                  </tr>
                  <tr>
                    ${recentPostsHtml}
                  </tr>
                </table>
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
                      <a href="https://nicholasegner.com/blog/" style="color:#475467;">Blog</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #eaecf0;font-size:11px;line-height:1.55;color:#98a2b3;">
                  You’re receiving this because I’m reaching out about professional video opportunities.
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

export default videoOutreachEmail;