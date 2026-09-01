import { getNewsletterConfigStatus } from "@/lib/newsletterConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getNewsletterConfigStatus());
}
