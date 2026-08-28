import { getEmailTemplates } from "@/lib/emailTemplates";

export async function GET() {
  const templates = getEmailTemplates().map(({ id, name, subject }) => ({
    id,
    name,
    subject,
  }));

  return Response.json({ templates });
}
