import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  deleteAppointment,
  updateAppointment,
} from "@/lib/repositories/appointments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.enum(["agendado", "confirmado", "realizado", "cancelado"]);
const typeSchema = z.enum(["consulta", "retorno", "avaliacao", "online", "outro"]);

const UpdateSchema = z
  .object({
    client_id: z.string().max(100).nullable().optional(),
    title: z.string().trim().min(1).max(160).optional(),
    appointment_type: typeSchema.optional(),
    starts_at: z.string().datetime().optional(),
    ends_at: z.string().datetime().nullable().optional(),
    status: statusSchema.optional(),
    location: z.string().trim().max(160).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo.",
  });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });
  }

  await updateAppointment(id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await params;
  await deleteAppointment(id);
  return NextResponse.json({ ok: true });
}
