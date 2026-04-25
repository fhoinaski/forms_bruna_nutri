import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getSubmissionById } from "@/lib/repositories/submissions";
import { getPreAnalysisBySubmissionId } from "@/lib/repositories/pre-analyses";
import {
  createAiProtocolDraft,
  getAiProtocolDraftsBySubmissionId,
} from "@/lib/repositories/ai-protocol-drafts";
import { generateProtocolDraft, PROMPT_VERSION } from "@/lib/ai/protocol-agent";
import { aiProtocolGenerateSchema } from "@/lib/validators/ai-protocol";
import { d1Execute } from "@/lib/d1/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const drafts = await getAiProtocolDraftsBySubmissionId(id);
  return NextResponse.json(drafts);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;

  const submission = await getSubmissionById(id);
  if (!submission) {
    return NextResponse.json({ message: "Formulário não encontrado." }, { status: 404 });
  }

  const body = await req.json() as Record<string, unknown>;
  const parsed = aiProtocolGenerateSchema.safeParse({ submissionId: id, ...body });
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ message: firstError }, { status: 400 });
  }

  const preAnalysis = await getPreAnalysisBySubmissionId(id);

  // Gera o rascunho
  const { output, aiModel, promptVersion } = await generateProtocolDraft({
    submission,
    preAnalysis,
    extraInstructions: parsed.data.extraInstructions,
  });

  // Snapshot do input (sem dados sensíveis desnecessários)
  const inputSnapshot = {
    submissionId: id,
    patientName: submission.patient_name,
    tipoAtendimento: submission.answers.tipoAtendimento ?? null,
    objetivo: submission.answers.objetivo ?? null,
    preAnalysisSummary: preAnalysis?.summary ?? null,
    extraInstructions: parsed.data.extraInstructions ?? null,
    generatedAt: new Date().toISOString(),
  };

  const draftId = await createAiProtocolDraft({
    submission_id: id,
    pre_analysis_id: preAnalysis?.id ?? null,
    title: output.title,
    ai_model: aiModel,
    prompt_version: promptVersion ?? PROMPT_VERSION,
    input_snapshot_json: JSON.stringify(inputSnapshot),
    output_json: JSON.stringify(output),
  });

  // Audit log
  await d1Execute(
    `INSERT INTO admin_audit_logs (id, action, metadata_json, created_at)
     VALUES (?1, 'ai_protocol_draft_generated', ?2, ?3)`,
    [
      crypto.randomUUID(),
      JSON.stringify({ draftId, submissionId: id, adminId: admin.sub }),
      new Date().toISOString(),
    ]
  );

  return NextResponse.json({ success: true, draftId }, { status: 201 });
}
