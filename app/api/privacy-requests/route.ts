import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPrivacyRequest } from "@/lib/repositories/privacy";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  requestType: z.enum(["acesso", "correcao", "exclusao", "revogacao", "informacao", "outro"]),
  details: z.string().trim().max(3000).optional().or(z.literal("")),
  privacyAccepted: z.literal(true),
  companyWebsite: z.string().max(0).optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit(req, { scope: "privacy-request", limit: 3, windowMs: 60 * 60 * 1000, blockMs: 2 * 60 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Aguarde e tente novamente." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  const body = await req.json().catch(() => null);
  if (body?.companyWebsite) return NextResponse.json({ success: true, id: crypto.randomUUID() }, { status: 201 });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Revise os dados informados." }, { status: 400 });
  const id = await createPrivacyRequest({ name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone || null, requestType: parsed.data.requestType, details: parsed.data.details || null });
  return NextResponse.json({ success: true, id }, { status: 201 });
}
