import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getAiProtocolDraftById } from "@/lib/repositories/ai-protocol-drafts";
import { createProtocolFromDraft } from "@/lib/repositories/protocols";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { d1Execute } from "@/lib/d1/client";
import type { ProtocolDraftOutput } from "@/lib/validators/ai-protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ draftId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }

  const { draftId } = await params;
  const draft = await getAiProtocolDraftById(draftId);

  if (!draft) {
    return NextResponse.json({ message: "Rascunho não encontrado." }, { status: 404 });
  }

  if (draft.status !== "approved") {
    return NextResponse.json(
      { message: "Apenas rascunhos aprovados podem ser convertidos em protocolo." },
      { status: 400 }
    );
  }

  let output: ProtocolDraftOutput;
  try {
    output = JSON.parse(draft.output_json) as ProtocolDraftOutput;
  } catch {
    return NextResponse.json({ message: "Rascunho com dados inválidos." }, { status: 422 });
  }

  const protocolId = await createProtocolFromDraft(draftId, admin.sub, output, draft.title);

  // Timeline: if draft is linked to a client
  if (draft.client_id) {
    await addTimelineEvent({
      client_id: draft.client_id,
      type: "protocol_created",
      title: "Protocolo oficial criado",
      description: `Protocolo "${draft.title}" criado a partir de rascunho IA`,
      metadata: { protocolId, draftId },
    });
  }

  await d1Execute(
    `INSERT INTO admin_audit_logs (id, action, metadata_json, created_at)
     VALUES (?1, 'protocol_created_from_draft', ?2, ?3)`,
    [
      crypto.randomUUID(),
      JSON.stringify({ protocolId, draftId, adminId: admin.sub }),
      new Date().toISOString(),
    ]
  );

  return NextResponse.json({ success: true, protocolId }, { status: 201 });
}
