import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getClientTasks } from "@/lib/repositories/client-tasks";
import { executeGetClientEvolutionSummary } from "@/lib/ai/agents/clinical/evolution-summary-agent";
import { executeGetPatientsWithPendenciesForDate } from "@/lib/ai/agents/appointments/schedule-lookup-agent";
import type { AssistantFactsPayload } from "@/lib/ai/core/ai-response";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Quick actions" cuja resposta e 100% deterministica (secao 33 do pedido de
 * UX: perguntas como "qual o peso atual?" nao precisam passar pelo LLM).
 * Chama exatamente a mesma logica que as tools de leitura do orquestrador
 * usam (mesmas funcoes `executeXxx`), so que direto — sem gateway de IA, sem
 * tokens, sem latencia de provedor. Autenticacao identica as outras rotas de
 * IA; nenhuma escrita acontece aqui.
 */
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("client_evolution"), clientId: z.string().min(1).max(120) }),
  z.object({ action: z.literal("client_pending_tasks"), clientId: z.string().min(1).max(120) }),
  z.object({ action: z.literal("day_overview"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD") }),
]);

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const limit = await consumeRateLimit(req, {
    scope: "ai-quick-facts",
    limit: 1200,
    windowMs: 60 * 60 * 1000,
    blockMs: 5 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Muitas solicitações em pouco tempo. Aguarde e tente novamente." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const input = parsed.data;
  let facts: AssistantFactsPayload;

  if (input.action === "client_evolution") {
    facts = { type: "client_evolution", data: await executeGetClientEvolutionSummary({ clientId: input.clientId }) };
  } else if (input.action === "client_pending_tasks") {
    const client = await getClientById(input.clientId);
    if (!client) {
      facts = { type: "client_pending_tasks", data: { found: false, clientName: "", tasks: [] } };
    } else {
      const tasks = await getClientTasks(client.id, { status: "pendente" });
      facts = {
        type: "client_pending_tasks",
        data: { found: true, clientName: client.name, tasks: tasks.map((task) => ({ title: task.title, dueDate: task.due_date })) },
      };
    }
  } else {
    facts = { type: "patients_with_pendencies", data: await executeGetPatientsWithPendenciesForDate({ date: input.date }) };
  }

  await writeAuditLog({
    action: "ai_quick_fact_used",
    adminId: admin.sub,
    entityType: "ai_chat",
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: {
      quickAction: input.action,
      clientId: "clientId" in input ? input.clientId : null,
      date: "date" in input ? input.date : null,
    },
  });

  return NextResponse.json({ facts });
}
