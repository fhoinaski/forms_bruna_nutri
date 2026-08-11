import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getSubmissionById } from "@/lib/repositories/submissions";
import {
  createClient,
  getClientBySubmissionId,
} from "@/lib/repositories/clients";
import { ClientDuplicateError } from "@/lib/clinical/client-identity";
import { markOpportunityConvertedBySubmissionId } from "@/lib/repositories/lead-opportunities";

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
    await markOpportunityConvertedBySubmissionId(id);
    return NextResponse.json({ success: true, clientId: existing.id, alreadyExisted: true });
  }

  // Monta notas iniciais com dados do formulário
  const answers = submission.answers as Record<string, unknown>;
  const noteParts: string[] = [];
  if (answers.tipoAtendimento) noteParts.push(`Tipo: ${answers.tipoAtendimento}`);
  if (answers.objetivo) noteParts.push(`Objetivo: ${answers.objetivo}`);
  if (answers.motivacao) noteParts.push(`Motivação: ${String(answers.motivacao).slice(0, 200)}`);
  const notes = noteParts.length > 0 ? noteParts.join(" | ") : null;

  let clientId: string;
  try {
    clientId = await createClient({
      name: submission.patient_name,
      email: submission.patient_email,
      phone: submission.patient_phone,
      source_submission_id: id,
      notes,
    });
  } catch (error) {
    // O email/telefone deste formulario pode coincidir com um cliente ja
    // cadastrado por outro caminho (cadastro manual, outra pre-consulta) —
    // nunca expor a constraint crua, e nunca criar um segundo cadastro.
    if (error instanceof ClientDuplicateError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    throw error;
  }
  await markOpportunityConvertedBySubmissionId(id);

  return NextResponse.json({ success: true, clientId, alreadyExisted: false }, { status: 201 });
}
