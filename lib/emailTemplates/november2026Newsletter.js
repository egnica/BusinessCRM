import { normalizeTrackingId, withTrackingId } from "./_trackingLinks.mjs";

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const CAMPAIGN = "thanksgiving_newsletter_nov_2026";
const SITE = "https://nicholasegner.com";
const EMAIL = "nick@nicholasegner.com";
const HERO_GIF =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/blog/hero-nov-2026.gif";
// White NE mark for the dark newsletter header (served as a public PNG by the CRM).
const HEADER_LOGO_URL =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/images/ne-white.svg";
// Preserve the established dark-on-light footer logo.
const FOOTER_LOGO_URL =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/images/mail-logo.png";
const GAME_CTA_GIF =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/images/see-what-i-madeBTN.gif";
const BTTF_THUMB =
  "https://nciholasegner.s3.us-east-2.amazonaws.com/blog/who_his_dad_thumb.webp";
const HUB_THUMB =
  "https://latestartbucket.s3.us-east-2.amazonaws.com/mobile-phone/Untitled-October-05-2026-at-12.37-1791236736341-4b31a8f6.webp";

const POSTS = [
  {
    title: "The Video SEO Trifecta",
    image:
      "https://nciholasegner.s3.us-east-2.amazonaws.com/blog/video_seo_thumbnail.webp",
    url: "/blog/video-seo-trifecta",
    content: "video_seo_trifecta",
  },
  {
    title: "How a Video Can Transform a Business’s Online Presence",
    image:
      "https://nciholasegner.s3.us-east-2.amazonaws.com/images/yourGardens-Thumb.webp",
    url: "/blog/your-gardens-by-design-video",
    content: "business_video",
  },
  {
    title:
      "I Built a Voice-to-Markdown Workflow with ChatGPT, GitHub, and Next.js",
    image:
      "https://nciholasegner.s3.us-east-2.amazonaws.com/blog/voice-to-md.webp",
    url: "/blog/voice-to-markdown-workflow",
    content: "voice_to_markdown",
  },
];

function websiteLink(path, trackingId, content) {
  const url = new URL(path, SITE);
  url.searchParams.set("utm_source", "crm");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", CAMPAIGN);
  if (content) url.searchParams.set("utm_content", content);
  return escapeHtml(withTrackingId(url.toString(), trackingId));
}

function button(label, url, theme = "blue") {
  const bg = theme === "blue" ? "#2448BD" : "#F2F4FA";
  const color = theme === "blue" ? "#FFFFFF" : "#2448BD";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;"><tr><td bgcolor="${bg}" style="border-radius:6px;background:${bg};"><a href="${url}" style="display:inline-block;padding:13px 19px;font:700 14px/1.3 Arial,Helvetica,sans-serif;color:${color};text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a></td></tr></table>`;
}

function feature({ title, image, alt, copy, url, buttonText }) {
  return `<tr><td class="body-pad" style="padding:28px 36px 34px;border-bottom:1px solid #E7EAF2;">
    <h2 style="margin:0 0 16px;color:#1C2639;font:700 24px/1.28 Arial,Helvetica,sans-serif;">${escapeHtml(title)}</h2>
    <a href="${url}" style="text-decoration:none;display:block;">
      <img src="${image}" alt="${escapeHtml(alt)}" width="548" style="display:block;width:100%;max-width:548px;height:auto;border:0;border-radius:7px;" />
    </a>
    <div style="font:16px/1.65 Arial,Helvetica,sans-serif;color:#303E53;padding-top:16px;">${copy}</div>
    ${button(buttonText, url)}
  </td></tr>`;
}

const november2026Newsletter = {
  id: "newsletter-november-2026",
  name: "Newsletter | Thanksgiving 2026",
  subject: "Happy Thanksgiving! Here's what I've been working on.",
  render({
    recipientName = "there",
    trackingId = "",
    unsubscribeUrl = "#",
  } = {}) {
    const name = escapeHtml(
      String(recipientName || "")
        .trim()
        .split(/\s+/)[0] || "there",
    );
    const id = normalizeTrackingId(trackingId);
    const unsubscribe = escapeHtml(unsubscribeUrl);

    const youtubeUrl = websiteLink(
      "/projects/youtube-video-production",
      id,
      "youtube_video_production",
    );
    const socialUrl = websiteLink(
      "/blog/building-my-own-social-media-hub",
      id,
      "social_media_hub",
    );
    const gameUrl = websiteLink("/who-are-you", id, "personalized_adventure");
    const homeUrl = websiteLink("/", id, "home");
    const blogUrl = websiteLink("/blog", id, "blog");
    const linkedinUrl = "https://www.linkedin.com/in/nicholas-egner";
    const aiEmail = `mailto:${EMAIL}?subject=${encodeURIComponent("Let's Talk About AI")}`;

    const posts = POSTS.map((post, i) => {
      const url = websiteLink(post.url, id, post.content);
      return `<td class="post-col" valign="top" width="33.33%" style="padding:${i === 0 ? "0 8px 0 0" : i === 2 ? "0 0 0 8px" : "0 4px"};width:33.33%;vertical-align:top;">
        <a href="${url}" style="display:block;text-decoration:none;"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" width="170" class="post-image" style="display:block;width:100%;max-width:170px;height:auto;border-radius:6px;border:0;" /></a>
        <p style="font:700 13px/1.45 Arial,Helvetica,sans-serif;margin:10px 0 0;"><a href="${url}" style="color:#26354A;text-decoration:none;">${escapeHtml(post.title)}</a></p>
      </td>`;
    }).join("");

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>What I've Been Working On | November 2026</title>
<style>
@media only screen and (max-width:520px){
  .outer-pad{padding:10px 0 !important}
  .body-pad{padding:24px 20px !important}
  .recent-wrap{padding:20px !important}
  .post-col{display:block !important;width:100% !important;padding:0 0 18px !important}
  .post-image{max-width:100% !important}
  .header-left{padding:15px 4px 15px 16px !important}
  .header-right{width:90px !important;padding:11px 12px 11px 2px !important}
  .header-contact{font-size:12px !important;line-height:1.65 !important}
  .header-contact a{display:block !important}
  .header-divider{display:none !important}
}
</style></head>
<body style="margin:0;padding:0;background:#F1F3F7;font-family:Arial,Helvetica,sans-serif;color:#26354A;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">40,000 YouTube views, a Social Media Hub, a personalized game, and a question about AI.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F3F7;"><tr><td align="center" class="outer-pad" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;background:#FFFFFF;border-collapse:collapse;">
<tr><td style="background:#2448BD;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;"><tr>
    <td class="header-left" valign="middle" style="padding:18px 8px 18px 24px;">
      <div class="header-contact" style="font:700 14px/1.5 Arial,Helvetica,sans-serif;color:#FFFFFF;">
        <a href="tel:+16309656187" style="color:#FFFFFF;text-decoration:none;white-space:nowrap;">630.965.6187</a>
        <span class="header-divider" style="color:#D6DAE7;">&nbsp;|&nbsp;</span>
        <a href="mailto:${EMAIL}" style="color:#FFFFFF;text-decoration:none;">Nick@NicholasEgner.com</a>
      </div>
    </td>
    <td class="header-right" valign="middle" align="right" width="114" style="padding:10px 20px 10px 0;width:114px;">
      <a href="${homeUrl}" style="display:inline-block;text-decoration:none;">
        <img src="${HEADER_LOGO_URL}" alt="Nicholas Egner logo" width="82" style="display:block;width:82px;max-width:100%;height:auto;border:0;" />
      </a>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:0;"><img src="${HERO_GIF}" width="620" alt="Happy Thanksgiving from Nicholas Egner. A look at my video, software, and AI projects." style="display:block;width:100%;max-width:620px;height:auto;border:0;" /></td></tr>
<tr><td class="body-pad" style="padding:28px 36px 30px;border-bottom:1px solid #E7EAF2;">
  <p style="margin:0 0 16px;font:16px/1.65 Arial,Helvetica,sans-serif;">Hello ${name},</p>
  <p style="margin:0 0 16px;font:16px/1.65 Arial,Helvetica,sans-serif;">Happy Thanksgiving! There's so much to be grateful for this year, and I wanted to take a moment to share a few projects I've been working on lately.</p>
  <p style="margin:0;font:16px/1.65 Arial,Helvetica,sans-serif;">Here's what I've been up to!</p>
</td></tr>
${feature({
  title: "4 Views in the First Hour. 40,000 in the First Week!",
  image: BTTF_THUMB,
  alt: "Back to the Future video thumbnail: Who's his dad?",
  copy: `<p style="margin:0 0 12px;">On November 5, I published a YouTube video exploring a question about <em>Back to the Future</em>: If Biff Tannen has a grandson, who's his son?</p><p style="margin:0 0 12px;">The video received just four views in its first hour. Seven days later, it had passed <strong>40,000 views!</strong></p><p style="margin:0;">I handled everything from the concept and script to filming, editing, motion graphics, and publishing. It's been exciting to watch an idea find an audience without an established following.</p>`,
  url: youtubeUrl,
  buttonText: "Explore the Video Project →",
})}
${feature({
  title: "Building My Own Social Media Hub",
  image: HUB_THUMB,
  alt: "Social Media Hub development thumbnail",
  copy: `<p style="margin:0 0 12px;">I was frustrated by juggling subscriptions and separate tools to manage social media, so I started building my own application.</p><p style="margin:0 0 12px;">I've now added <strong>Facebook, Instagram, LinkedIn, YouTube, and Google Business Profile</strong> to the Social Media Hub. The goal is to create and manage content for all five platforms in one place.</p><p style="margin:0;">I'm continuing to improve the experience as I use it. It's a good example of the custom software I enjoy building to solve everyday business problems.</p>`,
  url: socialUrl,
  buttonText: "Read About the Social Media Hub →",
})}
<tr><td class="body-pad" style="padding:28px 36px 34px;border-bottom:1px solid #E7EAF2;">
  <h2 style="margin:0 0 16px;color:#1C2639;font:700 24px/1.28 Arial,Helvetica,sans-serif;">An Introduction You Can Actually Play!</h2>
  <p style="margin:0 0 14px;font:16px/1.65 Arial,Helvetica,sans-serif;">I also created a little interactive adventure game! It's a fun example of the custom experiences I enjoy building, combining web development, design, and creativity.</p>
  <p style="margin:0 0 16px;font:16px/1.65 Arial,Helvetica,sans-serif;"><strong>And the best part? I've personalized it just for you.</strong></p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:4px 0 8px;"><a href="${gameUrl}" style="text-decoration:none;"><img src="${GAME_CTA_GIF}" width="280" alt="See what I made. Open your personalized adventure game." style="display:block;width:100%;max-width:280px;height:auto;border:0;" /></a></td></tr></table>
  <p style="margin:4px 0 0;text-align:center;font:13px/1.5 Arial,Helvetica,sans-serif;"><a href="${gameUrl}" style="color:#2448BD;text-decoration:underline;">Play your personalized adventure →</a></p>
</td></tr>
<tr><td class="body-pad" style="padding:30px 36px 36px;border-bottom:1px solid #E7EAF2;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#2448BD;border-radius:12px;"><tr>
    <td width="74" align="center" valign="middle" style="padding:17px 4px 17px 16px;vertical-align:middle;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="60" height="60" style="width:60px;height:60px;background:#FFFFFF;border-radius:35px;font:700 42px/60px Arial,Helvetica,sans-serif;color:#2448BD;">?</td></tr></table>
    </td>
    <td valign="middle" style="padding:15px 17px 15px 8px;vertical-align:middle;font:700 20px/1.3 Arial,Helvetica,sans-serif;color:#FFFFFF;">What could a custom AI assistant do for your business?</td>
  </tr></table>
  <p style="margin:20px 0 12px;font:16px/1.65 Arial,Helvetica,sans-serif;">I've been exploring how companies could benefit from AI tools built around their own information, documents, and everyday workflows.</p>
  <p style="margin:0 0 12px;font:16px/1.65 Arial,Helvetica,sans-serif;">I'm curious whether businesses have an interest in developing their own custom AI solutions.</p>
  <p style="margin:0 0 4px;font:16px/1.65 Arial,Helvetica,sans-serif;"><strong>Is this something you've considered?</strong> I'd love to hear your thoughts. You can reply directly to this email.</p>
  ${button("Let's Talk About AI →", escapeHtml(aiEmail))}
</td></tr>
<tr><td class="body-pad" style="padding:27px 36px 20px;">
  <p style="margin:0;font:16px/1.7 Arial,Helvetica,sans-serif;">Thanks for reading, and I hope you have a wonderful Thanksgiving!</p>
  <p style="margin:18px 0 0;font:16px/1.65 Arial,Helvetica,sans-serif;">Nicholas Egner</p>
  <p style="margin:4px 0 0;font:14px/1.5 Arial,Helvetica,sans-serif;"><a href="${homeUrl}" style="color:#2448BD;">nicholasegner.com</a></p>
</td></tr>
<tr><td class="recent-wrap" style="padding:18px 36px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #E7EAF2;"><tr><td colspan="3" style="padding:21px 0 14px;font:700 12px/1.4 Arial,Helvetica,sans-serif;letter-spacing:.08em;color:#657187;">RECENT WORK &amp; POSTS</td></tr><tr>${posts}</tr></table></td></tr>
<tr><td style="background:#F9FAFC;border-top:1px solid #E7EAF2;padding:20px 36px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td valign="middle" width="132" style="vertical-align:middle;padding-right:16px;"><a href="${homeUrl}" style="text-decoration:none;"><img src="${FOOTER_LOGO_URL}" width="110" alt="Nicholas Egner" style="display:block;width:110px;max-width:100%;height:auto;border:0;" /></a></td>
    <td valign="middle" style="vertical-align:middle;font:13px/1.65 Arial,Helvetica,sans-serif;color:#657187;"><strong style="color:#26354A;">Nicholas Egner</strong><br /><a href="mailto:${EMAIL}" style="color:#485870;">${EMAIL}</a><br /><a href="${homeUrl}" style="color:#485870;">Website</a>&nbsp;|&nbsp;<a href="${linkedinUrl}" style="color:#485870;">LinkedIn</a>&nbsp;|&nbsp;<a href="${blogUrl}" style="color:#485870;">Blog</a></td>
  </tr></table>
  <p style="margin:20px 0 0;padding-top:14px;border-top:1px solid #E7EAF2;font:11px/1.55 Arial,Helvetica,sans-serif;color:#738197;">You're receiving this newsletter because you've subscribed to updates from Nicholas Egner. <a href="${unsubscribe}" style="color:#485870;text-decoration:underline;">Unsubscribe</a></p>
</td></tr>
</table></td></tr></table>
</body></html>`;
  },
};

export default november2026Newsletter;
