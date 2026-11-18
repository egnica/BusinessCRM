export function classifyEmailClickEngagement(email) {
  const clicks = (email.events || []).filter(e => e.type === "email.clicked" && e.link)
    .map(e => ({ time: Date.parse(e.at), link: e.link }))
    .filter(e => Number.isFinite(e.time)).sort((a, b) => a.time - b.time);
  const delivered = Date.parse(email.eventTimestamps?.deliveredAt || email.sentAt || email.createdAt);
  let burst = null;
  for (const click of clicks) {
    if (!Number.isFinite(delivered) || click.time < delivered - 30000 || click.time > delivered + 120000) continue;
    const batch = clicks.filter(e => e.time >= click.time && e.time <= click.time + 30000);
    const unique = new Set(batch.map(e => e.link)).size;
    if (unique >= 3) {
      burst = { end: Math.max(...batch.map(e => e.time)), explanation: `${unique} distinct links were requested within 30 seconds shortly after delivery.` };
      break;
    }
    const repeated = batch.filter(e => e.link === click.link && e.time <= click.time + 5000);
    if (repeated.length >= 3) {
      burst = { end: Math.max(...repeated.map(e => e.time)), explanation: "The same link was requested at least three times within five seconds shortly after delivery." };
      break;
    }
  }
  if (!burst) return null;
  const later = clicks.filter(e => e.time > burst.end + 300000);
  const humanLike = later.length > 0;
  return {
    label: humanLike ? "Later Engagement" : "Bot Likely",
    suspected: !humanLike,
    explanation: humanLike
      ? "An automated-looking click burst was followed by a link click more than five minutes later. Human engagement is possible, but not verified."
      : `${burst.explanation} This suggests automated security scanning.`,
  };
}
