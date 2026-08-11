import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getProtocolById } from "@/lib/repositories/protocols";
import {
  applyProtocolToClient,
  createProtocolAndApplyToClient,
  getClientProtocols,
  hasActiveProtocol,
} from "@/lib/repositories/client-protocols";
import { parseProtocolActions } from "@/lib/protocols/helpers";
import {
  createTasksFromDraft,
  createTasksFromProtocolPhases,
} from "@/lib/repositories/client-tasks";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { getAiProtocolDraftById } from "@/lib/repositories/ai-protocol-drafts";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";
import type { ProtocolDraftOutput } from "@/lib/validators/ai-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const commonApplyFields = {
  startedAt: z.string().date().optional(),
  reviewDate: z.string().date().optional().nullable(),
  professionalNotes: z.string().max(5000).optional().nullable(),
  createTasks: z.boolean().default(true),
};

const requestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("apply"),
    protocolId: z.string().uuid(),
    sourceDraftId: z.string().uuid().optional().nullable(),
    ...commonApplyFields,
  }).strict(),
  z.object({
    mode: z.literal("create_personalized"),
    baseProtocolId: z.string().uuid().optional().nullable(),
    title: z.string().min(1).max(500),
    description: z.string().max(10000).optional().nullable(),
    category: z.string().max(100).optional().nullable(),
    ...commonApplyFields,
  }).strict(),
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  return NextResponse.json(await getClientProtocols(id));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id: clientId } = await params;
  const client = await getClientById(clientId);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const startedAt = parsed.data.startedAt ?? new Date().toISOString().slice(0, 10);

  let protocolId: string;
  let clientProtocolId: string;
  let protocolTitle: string;
  let protocolKind: "standard" | "personalized";
  let phases: Array<{ title: string; days: string | null; objective: string | null; actions: string[]; actions_json: string; notes: string | null }>;
  let sourceDraftId: string | null = null;

  if (parsed.data.mode === "create_personalized") {
    // createProtocolAndApplyToClient cria o protocolo (+fases copiadas, se
    // houver protocolo base) E o vincula ao paciente numa unica escrita
    // atomica — nunca deixa um protocolo orfao (criado mas sem
    // client_protocols) se a segunda parte falhasse como no fluxo antigo.
    if (parsed.data.baseProtocolId) {
      const source = await getProtocolById(parsed.data.baseProtocolId);
      if (!source) return NextResponse.json({ message: "Protocolo de origem não encontrado." }, { status: 404 });
      phases = source.phases.map((phase) => ({
        title: phase.title, days: phase.days, objective: phase.objective,
        actions: parseProtocolActions(phase.actions_json), actions_json: phase.actions_json, notes: phase.notes,
      }));
    } else {
      phases = [];
    }

    const created = await createProtocolAndApplyToClient({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      createdBy: admin.sub,
      kind: "personalized",
      clientId,
      copiedFromProtocolId: parsed.data.baseProtocolId ?? null,
      phases: phases.map(({ title, days, objective, actions, notes }) => ({ title, days, objective, actions, notes })),
      apply: {
        startedAt,
        reviewDate: parsed.data.reviewDate,
        professionalNotes: parsed.data.professionalNotes,
      },
    });
    protocolId = created.protocolId;
    clientProtocolId = created.clientProtocolId;
    protocolTitle = parsed.data.title;
    protocolKind = "personalized";
  } else {
    protocolId = parsed.data.protocolId;
    const protocol = await getProtocolById(protocolId);
    if (!protocol || protocol.is_active !== 1) {
      return NextResponse.json({ message: "Protocolo ativo não encontrado." }, { status: 404 });
    }
    if (protocol.kind === "personalized" && protocol.client_id !== clientId) {
      return NextResponse.json({ message: "Este protocolo pertence a outra cliente." }, { status: 403 });
    }
    if (await hasActiveProtocol(clientId, protocolId)) {
      return NextResponse.json({ message: "Este protocolo já está ativo para a cliente." }, { status: 409 });
    }

    sourceDraftId = parsed.data.sourceDraftId ?? null;
    clientProtocolId = await applyProtocolToClient(clientId, protocolId, {
      sourceDraftId,
      startedAt,
      reviewDate: parsed.data.reviewDate,
      professionalNotes: parsed.data.professionalNotes,
    });
    protocolTitle = protocol.title;
    protocolKind = protocol.kind;
    phases = protocol.phases.map((phase) => ({
      title: phase.title, days: phase.days, objective: phase.objective,
      actions: parseProtocolActions(phase.actions_json), actions_json: phase.actions_json, notes: phase.notes,
    }));
  }

  let tasksCreated = 0;
  if (parsed.data.createTasks) {
    if (sourceDraftId) {
      const draft = await getAiProtocolDraftById(sourceDraftId);
      if (draft) {
        try {
          const output = JSON.parse(draft.output_json) as ProtocolDraftOutput;
          if (output.tasks?.length) {
            await createTasksFromDraft(clientId, clientProtocolId, output.tasks);
            tasksCreated = output.tasks.length;
          }
        } catch {
          tasksCreated = 0;
        }
      }
    } else if (phases.length) {
      tasksCreated = await createTasksFromProtocolPhases(
        clientId,
        clientProtocolId,
        phases,
        startedAt
      );
    }
  }

  await addTimelineEvent({
    client_id: clientId,
    type: "protocol_applied",
    title: protocolKind === "personalized" ? "Protocolo personalizado iniciado" : "Protocolo padrão iniciado",
    description: `Protocolo "${protocolTitle}" aplicado com ${phases.length} fase(s) e ${tasksCreated} tarefa(s).`,
    metadata: { clientProtocolId, protocolId, tasksCreated, kind: protocolKind },
  });
  await writeAuditLog({
    action: "client_protocol_applied",
    adminId: admin.sub,
    entityType: "client_protocol",
    entityId: clientProtocolId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId, protocolId, tasksCreated, kind: protocolKind },
  });

  return NextResponse.json(
    { success: true, clientProtocolId, protocolId, tasksCreated },
    { status: 201 }
  );
}
