import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getProtocolById } from "@/lib/repositories/protocols";
import { applyProtocolToClient, getClientProtocols } from "@/lib/repositories/client-protocols";
import { createTasksFromDraft } from "@/lib/repositories/client-tasks";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { getAiProtocolDraftById } from "@/lib/repositories/ai-protocol-drafts";
import { z } from "zod";
import type { ProtocolDraftOutput } from "@/lib/validators/ai-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const applySchema = z.object({
  protocolId: z.string().min(1),
  sourceDraftId: z.string().optional().nullable(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const protocols = await getClientProtocols(id);
  return NextResponse.json(protocols);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;

  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });

  const body = await req.json();
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const protocol = await getProtocolById(parsed.data.protocolId);
  if (!protocol) return NextResponse.json({ message: "Protocolo não encontrado." }, { status: 404 });

  const clientProtocolId = await applyProtocolToClient(id, parsed.data.protocolId, parsed.data.sourceDraftId);

  // Criar tarefas a partir do rascunho, se fornecido
  if (parsed.data.sourceDraftId) {
    const draft = await getAiProtocolDraftById(parsed.data.sourceDraftId);
    if (draft) {
      try {
        const output = JSON.parse(draft.output_json) as ProtocolDraftOutput;
        if (output.tasks?.length) {
          await createTasksFromDraft(id, clientProtocolId, output.tasks);
        }
      } catch {
        // silently skip task creation if output_json is malformed
      }
    }
  }

  await addTimelineEvent({
    client_id: id,
    type: "protocol_applied",
    title: "Protocolo aplicado",
    description: `Protocolo "${protocol.title}" aplicado ao cliente`,
    metadata: { clientProtocolId, protocolId: parsed.data.protocolId },
  });

  return NextResponse.json({ success: true, clientProtocolId }, { status: 201 });
}
