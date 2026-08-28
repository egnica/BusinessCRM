import { getEmailTemplate } from "@/lib/emailTemplates";

export async function POST(req) {
  try {
    const { templateId } = await req.json();
    const template = getEmailTemplate(templateId);

    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    const html = template.render({
      recipientName: "Sample Contact",
      unsubscribeUrl: "#",
    });

    return Response.json({
      html,
      subject: template.subject,
    });
  } catch (error) {
    console.error("Newsletter preview error:", error);
    return Response.json(
      { error: "Failed to preview newsletter" },
      { status: 500 },
    );
  }
}
