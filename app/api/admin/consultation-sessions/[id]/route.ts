import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getConsultationSessionById, updateConsultationNotes } from "@/lib/repositories/consultation-sessions";
import { saveConsultationWorkspaceDraft } from "@/lib/repositories/patient-consultation-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const draftSchema = z.object({
  evolution: z.string().max(5000),
  adherence: z.string().max(5000),
  symptoms: z.string().max(5000),
  conduct: z.string().max(5000),
  goals: z.string().max(5000),
  observations: z.string().max(5000),
}).strict();

const patchSchema = z.object({
  clientId: z.string().min(1).max(100),
  notes: z.string().max(20000).optional(),
  draft: draftSchema.optional(),
}).strict().refine((value) => value.notes !== undefined || value.draft !== undefined, {
  message: "Informe notas ou campos da consulta.",
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ message: "Paciente da consulta não informado." }, { status: 400 });

  const session = await getConsultationSessionById(id);
  if (!session) return NextResponse.json({ message: "Sessão de consulta não encontrada." }, { status: 404 });
  if (session.client_id !== clientId) {
    return NextResponse.json({ message: "Sessão de consulta não encontrada para este paciente." }, { status: 404 });
  }
  return NextResponse.json({ session });
}

/** Salva as notas rapidas da consulta em andamento — texto livre da nutricionista, cifrado em repouso. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const existing = await getConsultationSessionById(id);
  if (!existing) return NextResponse.json({ message: "Sessão de consulta não encontrada." }, { status: 404 });
  if (existing.client_id !== parsed.data.clientId) {
    return NextResponse.json({ message: "Sessão de consulta não encontrada para este paciente." }, { status: 404 });
  }
  if (existing.status !== "in_progress") {
    return NextResponse.json({ message: "Esta consulta já foi finalizada ou cancelada." }, { status: 409 });
  }

  if (parsed.data.draft) {
    const saved = await saveConsultationWorkspaceDraft({
      patientId: parsed.data.clientId,
      consultationId: id,
      draft: parsed.data.draft,
    });
    if (!saved) return NextResponse.json({ message: "Esta consulta já foi finalizada ou cancelada." }, { status: 409 });
  } else if (parsed.data.notes !== undefined) {
    await updateConsultationNotes(id, parsed.data.notes);
  }
  return NextResponse.json({ success: true });
}
