import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { recordCanonicalResolutionFeedback } from "@/lib/repositories/canonical-resolution-feedback";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FASE 6 (item 8/9) — feedback da nutricionista sobre uma sugestão do
 * piloto canônico (admin_food_search). Só registra a linha — NUNCA cria
 * alias, NUNCA muda ranking/policy automaticamente (item 9). É consumido
 * só por revisão humana futura (ver reports/canonical-alias-*.md das
 * fases anteriores pro mesmo padrão de "candidato pra revisão", nunca
 * inserção automática).
 */
const FeedbackSchema = z.object({
  queryHash: z.string().min(1).max(64),
  suggestedCanonicalFoodId: z.string().max(120).nullable().optional(),
  suggestedMatchClass: z.string().max(60).nullable().optional(),
  // FASE 6.5 (item 5) — TBCA/IBGE_POF aceitos: o piloto agora pode
  // preselecionar essas fontes, entao o feedback precisa poder registrar.
  chosenSource: z.enum(["TACO", "CUSTOM", "MANUFACTURER", "USDA", "TBCA", "IBGE_POF"]).nullable().optional(),
  chosenSourceId: z.string().max(120).nullable().optional(),
  outcome: z.enum(["CORRECT", "WRONG", "CHANGED_SELECTION"]),
}).strict();

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const limit = await consumeRateLimit(req, { scope: "canonical-food-feedback", limit: 120, windowMs: 60 * 60 * 1000, blockMs: 10 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const parsed = FeedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const input = parsed.data;

  await recordCanonicalResolutionFeedback({
    queryHash: input.queryHash,
    suggestedCanonicalFoodId: input.suggestedCanonicalFoodId ?? null,
    suggestedMatchClass: input.suggestedMatchClass ?? null,
    chosenSource: input.chosenSource ?? null,
    chosenSourceId: input.chosenSourceId ?? null,
    outcome: input.outcome,
    adminId: admin.sub,
  });

  return NextResponse.json({ ok: true });
}
