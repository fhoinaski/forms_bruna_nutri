import { NextRequest, NextResponse } from "next/server";
import { LegacyFormSchema } from "@/lib/validators/submission";
import { createSubmission } from "@/lib/repositories/submissions";
import { recordConsent } from "@/lib/repositories/privacy";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getRequestFingerprint } from "@/lib/security/request";
import { ensureOpportunityForSubmission } from "@/lib/repositories/lead-opportunities";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const limit = await consumeRateLimit(req, {
      scope: "public-form",
      limit: 5,
      windowMs: 60 * 60 * 1000,
      blockMs: 2 * 60 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, message: "Muitas tentativas. Aguarde antes de tentar novamente." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }

    const body = await req.json();

    // Bots usually fill this invisible field. Return success without persisting data.
    if (typeof body?.companyWebsite === "string" && body.companyWebsite.length > 0) {
      return NextResponse.json({ success: true, id: crypto.randomUUID() }, { status: 201 });
    }

    const result = LegacyFormSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Dados inválidos." },
        { status: 400 }
      );
    }

    const data = result.data;
    const { nome, email, whatsapp, child_name, child_age, privacyAccepted: _, companyWebsite: __, ...rest } = data;

    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null && value !== "") {
        answers[key] = String(value);
      }
    }

    const id = await createSubmission({
      patient_name: nome,
      patient_email: email || null,
      patient_phone: whatsapp || null,
      child_name: child_name || null,
      child_age: child_age || null,
      form_type: "pre_consulta",
      answers,
    });
    const fingerprint = getRequestFingerprint(req);
    await recordConsent({ submissionId: id, ...fingerprint });
    await ensureOpportunityForSubmission(id);

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    logger.error("form_submission_create_failed", { error });
    return NextResponse.json(
      { success: false, message: "Não foi possível enviar o formulário." },
      { status: 500 }
    );
  }
}
