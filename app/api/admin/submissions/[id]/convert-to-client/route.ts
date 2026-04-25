import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getSubmissionById } from "@/lib/repositories/submissions";
import {
  createClient,
  getClientBySubmissionId,
} from "@/lib/repositories/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Idempotente: retorna o cliente existente se já foi convertido
  const existing = await getClientBySubmissionId(id);
  if (existing) {
    return NextResponse.json({ success: true, clientId: existing.id, alreadyExisted: true });
  }

  // Monta notas iniciais com dados do formulário
  const answers = submission.answers as Record<string, unknown>;
  const noteParts: string[] = [];
  if (answers.tipoAtendimento) noteParts.push(`Tipo: ${answers.tipoAtendimento}`);
  if (answers.objetivo) noteParts.push(`Objetivo: ${answers.objetivo}`);
  if (answers.motivacao) noteParts.push(`Motivação: ${String(answers.motivacao).slice(0, 200)}`);
  const notes = noteParts.length > 0 ? noteParts.join(" | ") : null;

  const clientId = await createClient({
    name: submission.patient_name,
    email: submission.patient_email,
    phone: submission.patient_phone,
    source_submission_id: id,
    notes,
  });

  return NextResponse.json({ success: true, clientId, alreadyExisted: false }, { status: 201 });
}
