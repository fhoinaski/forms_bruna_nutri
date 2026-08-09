import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { suggestMealWithAI } from "@/lib/ai/meal-suggestion-agent";
import { aiMealSuggestionContextSchema } from "@/lib/validators/ai-meal-suggestion";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const limit = await consumeRateLimit(req, {
    scope: "ai-meal-suggestion",
    limit: 20,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitacoes. Tente novamente mais tarde.", retryAfter: limit.retryAfter }, { status: 429 });
  }

  const parsed = aiMealSuggestionContextSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  try {
    const suggestion = await suggestMealWithAI(parsed.data);
    await writeAuditLog({
      action: "ai_meal_suggestion_requested",
      adminId: admin.sub,
      entityType: "ai_meal_suggestion",
      entityId: `${parsed.data.context}:${parsed.data.targetGroup ?? "geral"}`,
      ipHash: limit.ipHash,
      metadata: {
        context: parsed.data.context,
        targetGroup: parsed.data.targetGroup ?? null,
        mealGroup: parsed.data.mealGroup ?? null,
        hasInstructions: Boolean(parsed.data.instructions?.trim()),
        aiModel: suggestion.aiModel,
      },
    });
    return NextResponse.json(suggestion);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Nao foi possivel gerar sugestao com IA.";
    return NextResponse.json({ message }, { status: message.includes("configurad") ? 409 : 422 });
  }
}
