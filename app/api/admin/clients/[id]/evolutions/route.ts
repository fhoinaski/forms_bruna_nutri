import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientEvolutions, createClientEvolution } from "@/lib/repositories/client-evolutions";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { getClientById } from "@/lib/repositories/clients";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  client_protocol_id: z.string().optional().nullable(),
  weight: z.number().positive().optional().nullable(),
  height: z.number().positive().optional().nullable(),
  symptoms: z.string().max(5000).optional().nullable(),
  adherence_notes: z.string().max(5000).optional().nullable(),
  progress_notes: z.string().max(5000).optional().nullable(),
  conduct_notes: z.string().max(5000).optional().nullable(),
  next_steps: z.string().max(5000).optional().nullable(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const evolutions = await getClientEvolutions(id);
  return NextResponse.json(evolutions);
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const evolutionId = await createClientEvolution({ client_id: id, ...parsed.data });

  const weightNote = parsed.data.weight ? ` | Peso: ${parsed.data.weight}kg` : "";
  await addTimelineEvent({
    client_id: id,
    type: "evolution_recorded",
    title: "Evolução registrada",
    description: `Registro de evolução clínica${weightNote}`,
    metadata: { evolutionId },
  });

  return NextResponse.json({ success: true, evolutionId }, { status: 201 });
}
