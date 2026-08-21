import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getExistingNutritionRecord } from "@/lib/repositories/nutrition-records";
import { suggestSubstitutionCandidates } from "@/lib/ai/agents/nutrition/substitution-suggestion-agent";
import { AiConfigError, AiProviderError, AiValidationError } from "@/lib/ai/core/ai-errors";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SuggestAiSchema = z.object({
  baseFoodName: z.string().min(1).max(200),
}).strict();

/**
 * "[Sugerir com IA]" (seção 10 do pedido) — a IA só devolve NOMES de
 * alimentos candidatos, nunca quantidade nem valor nutricional (o schema
 * literalmente não tem esses campos). O chamador deve levar esses nomes
 * para /substitutions/suggest (motor determinístico) para virarem
 * candidatos calculados de verdade — nunca são usados diretamente.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const limit = await consumeRateLimit(req, {
    scope: "meal-plan-substitution-suggest-ai",
    limit: 20,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const parsed = SuggestAiSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const record = await getExistingNutritionRecord(id);
    const candidates = await suggestSubstitutionCandidates({
      clientId: id,
      adminId: admin.sub,
      baseFoodName: parsed.data.baseFoodName,
      allergies: record?.allergies ?? null,
      restrictions: record?.restrictions ?? null,
      foodAversions: record?.food_aversions ?? null,
    });

    await writeAuditLog({
      action: "meal_plan_substitution_ai_suggested",
      adminId: admin.sub,
      entityType: "client",
      entityId: id,
      ipHash: limit.ipHash,
      metadata: { candidatesReturned: candidates.length },
    });

    return NextResponse.json({ candidates });
  } catch (cause) {
    if (cause instanceof AiConfigError) {
      return NextResponse.json({ message: "Configure um provedor de IA em Configurações antes de usar este recurso." }, { status: 409 });
    }
    if (cause instanceof AiProviderError) {
      return NextResponse.json({ message: cause.message }, { status: 502 });
    }
    if (cause instanceof AiValidationError) {
      return NextResponse.json({ message: "Não conseguimos gerar sugestões nesta tentativa." }, { status: 422 });
    }
    const message = cause instanceof Error ? cause.message : "Não foi possível gerar sugestões.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
