import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getConsultationSessionById, updateConsultationNotes } from "@/lib/repositories/consultation-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  notes: z.string().max(20000),
}).strict();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const session = await getConsultationSessionById(id);
  if (!session) return NextResponse.json({ message: "Sessão de consulta não encontrada." }, { status: 404 });
  return NextResponse.json({ session });
}

/** Salva as notas rapidas da consulta em andamento — texto livre da nutricionista, cifrado em repouso. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const existing = await getConsultationSessionById(id);
  if (!existing) return NextResponse.json({ message: "Sessão de consulta não encontrada." }, { status: 404 });
  if (existing.status !== "in_progress") {
    return NextResponse.json({ message: "Esta consulta já foi finalizada ou cancelada." }, { status: 409 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  await updateConsultationNotes(id, parsed.data.notes);
  return NextResponse.json({ success: true });
}
