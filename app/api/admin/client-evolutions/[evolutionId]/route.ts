import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  getClientEvolutionById,
  updateClientEvolution,
  deleteClientEvolution,
} from "@/lib/repositories/client-evolutions";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  weight: z.number().positive().optional().nullable(),
  height: z.number().positive().optional().nullable(),
  symptoms: z.string().max(5000).optional().nullable(),
  adherence_notes: z.string().max(5000).optional().nullable(),
  progress_notes: z.string().max(5000).optional().nullable(),
  conduct_notes: z.string().max(5000).optional().nullable(),
  next_steps: z.string().max(5000).optional().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ evolutionId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { evolutionId } = await params;
  const evolution = await getClientEvolutionById(evolutionId);
  if (!evolution) return NextResponse.json({ message: "Evolução não encontrada." }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  await updateClientEvolution(evolutionId, parsed.data);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ evolutionId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { evolutionId } = await params;
  const evolution = await getClientEvolutionById(evolutionId);
  if (!evolution) return NextResponse.json({ message: "Evolução não encontrada." }, { status: 404 });

  await deleteClientEvolution(evolutionId);
  return NextResponse.json({ success: true });
}
