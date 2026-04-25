import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  getAiProtocolDraftById,
  updateAiProtocolDraftOutput,
  markAiProtocolDraftReviewed,
  updateAiProtocolDraftStatus,
} from "@/lib/repositories/ai-protocol-drafts";
import { aiProtocolDraftUpdateSchema } from "@/lib/validators/ai-protocol";
import { d1Execute } from "@/lib/d1/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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

  return NextResponse.json(draft);
}

export async function PATCH(
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

  const body = await req.json();
  const parsed = aiProtocolDraftUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ message: firstError }, { status: 400 });
  }

  const { title, output_json, status } = parsed.data;

  // Atualizar conteúdo editado
  if (title !== undefined || output_json !== undefined) {
    await updateAiProtocolDraftOutput(
      draftId,
      title ?? draft.title,
      output_json ?? draft.output_json
    );
  }

  // Mudança de status que envolve revisão
  if (status !== undefined) {
    if (status === "reviewed" || status === "approved" || status === "rejected") {
      await markAiProtocolDraftReviewed(draftId, admin.sub, status);

      const action =
        status === "approved"
          ? "ai_protocol_draft_approved"
          : status === "rejected"
          ? "ai_protocol_draft_rejected"
          : "ai_protocol_draft_reviewed";

      await d1Execute(
        `INSERT INTO admin_audit_logs (id, action, metadata_json, created_at)
         VALUES (?1, ?2, ?3, ?4)`,
        [
          crypto.randomUUID(),
          action,
          JSON.stringify({
            draftId,
            submissionId: draft.submission_id,
            adminId: admin.sub,
          }),
          new Date().toISOString(),
        ]
      );
    } else {
      await updateAiProtocolDraftStatus(draftId, status);
    }
  }

  return NextResponse.json({ success: true });
}
