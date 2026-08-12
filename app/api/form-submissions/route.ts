import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { getRequestFingerprint } from "@/lib/security/request";
import {
  submitPreConsultation,
  SubmissionValidationError,
} from "@/lib/clinical/submit-pre-consultation";
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

    const fingerprint = getRequestFingerprint(req);
    const { id } = await submitPreConsultation(body, {
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash,
      source: "traditional",
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof SubmissionValidationError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
    }
    logger.error("form_submission_create_failed", { error });
    return NextResponse.json(
      { success: false, message: "Não foi possível enviar o formulário." },
      { status: 500 }
    );
  }
}