import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
import { executeGetMyMealPlan, executeGetMyAppointments, executeGetMyTasks } from "@/lib/ai/agents/patient/patient-portal-agent";
import type { PatientAssistantFactsPayload } from "@/lib/ai/core/patient-response";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quick actions 100% deterministicas do portal (secao 9/28 do pedido) —
 * "Meu plano"/"Próxima consulta"/"Minhas tarefas" nunca precisam do LLM.
 * clientId sempre vem da sessao (session.sub), nunca do body.
 */
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("meal_plan") }),
  z.object({ action: z.literal("appointments") }),
  z.object({ action: z.literal("tasks") }),
]);

export async function POST(req: NextRequest) {
  const session = await getClientPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const limit = await consumeRateLimit(req, {
    scope: "portal-ai-quick-facts",
    limit: 60,
    windowMs: 15 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json({ message: "Muitas solicitações em pouco tempo. Aguarde um pouco." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Não consegui entender essa solicitação." }, { status: 400 });

  let facts: PatientAssistantFactsPayload;
  if (parsed.data.action === "meal_plan") {
    facts = { type: "meal_plan", data: await executeGetMyMealPlan(session.sub) };
  } else if (parsed.data.action === "appointments") {
    facts = { type: "appointments", data: await executeGetMyAppointments(session.sub, { scope: "next" }) };
  } else {
    facts = { type: "tasks", data: await executeGetMyTasks(session.sub) };
  }

  return NextResponse.json({ facts });
}
