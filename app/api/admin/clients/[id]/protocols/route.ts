import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import {
  cloneProtocolForClient,
  createProtocol,
  getProtocolById,
} from "@/lib/repositories/protocols";
import {
  applyProtocolToClient,
  getClientProtocols,
  hasActiveProtocol,
} from "@/lib/repositories/client-protocols";
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

  let protocolId: string;
  if (parsed.data.mode === "create_personalized") {
    if (parsed.data.baseProtocolId) {
      protocolId = await cloneProtocolForClient({
        sourceProtocolId: parsed.data.baseProtocolId,
        clientId,
        createdBy: admin.sub,
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
      });
    } else {
      protocolId = await createProtocol({
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        created_by: admin.sub,
        kind: "personalized",
        client_id: clientId,
        phases: [],
      });
    }
  } else {
    protocolId = parsed.data.protocolId;
  }

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

  const startedAt = parsed.data.startedAt ?? new Date().toISOString().slice(0, 10);
  const sourceDraftId = parsed.data.mode === "apply" ? parsed.data.sourceDraftId : null;
  const clientProtocolId = await applyProtocolToClient(clientId, protocolId, {
    sourceDraftId,
    startedAt,
    reviewDate: parsed.data.reviewDate,
    professionalNotes: parsed.data.professionalNotes,
  });

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
    } else {
      tasksCreated = await createTasksFromProtocolPhases(
        clientId,
        clientProtocolId,
        protocol.phases,
        startedAt
      );
    }
  }

  await addTimelineEvent({
    client_id: clientId,
    type: "protocol_applied",
    title: protocol.kind === "personalized" ? "Protocolo personalizado iniciado" : "Protocolo padrão iniciado",
    description: `Protocolo "${protocol.title}" aplicado com ${protocol.phases.length} fase(s) e ${tasksCreated} tarefa(s).`,
    metadata: { clientProtocolId, protocolId, tasksCreated, kind: protocol.kind },
  });
  await writeAuditLog({
    action: "client_protocol_applied",
    adminId: admin.sub,
    entityType: "client_protocol",
    entityId: clientProtocolId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { clientId, protocolId, tasksCreated, kind: protocol.kind },
  });

  return NextResponse.json(
    { success: true, clientProtocolId, protocolId, tasksCreated },
    { status: 201 }
  );
}
