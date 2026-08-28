import { Resend } from "resend";
import { getEmailTemplate } from "@/lib/emailTemplates";

export async function POST(req) {
  try {
    const { templateId, subject, email } = await req.json();

    if (!email) {
      return Response.json(
        { error: "A test recipient email is required" },
        { status: 400 },
      );
    }

    const template = getEmailTemplate(templateId);

    if (!template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
      return Response.json(
        { error: "Resend environment variables are not configured" },
        { status: 500 },
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: subject?.trim() || template.subject,
      html: template.render({
        recipientName: "Test Recipient",
        unsubscribeUrl: "#",
      }),
    });

    if (error) {
      console.error("Resend test error:", error);
      return Response.json(
        { error: error.message || "Failed to send test email" },
        { status: 500 },
      );
    }

    return Response.json({
      message: "Test email sent",
      id: data?.id || null,
    });
  } catch (error) {
    console.error("Newsletter test error:", error);
    return Response.json(
      { error: "Failed to send test email" },
      { status: 500 },
    );
  }
}
