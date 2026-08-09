import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  createAppointment,
  getAppointments,
} from "@/lib/repositories/appointments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.enum(["agendado", "confirmado", "realizado", "cancelado"]);
const typeSchema = z.enum(["primeira_consulta", "consulta", "retorno", "avaliacao", "online", "outro"]);

const FiltersSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: statusSchema.optional(),
  clientId: z.string().max(100).optional(),
});

const CreateSchema = z.object({
  client_id: z.string().max(100).nullable().optional(),
  title: z.string().trim().min(1).max(160),
  appointment_type: typeSchema.default("consulta"),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().nullable().optional(),
  status: statusSchema.default("agendado"),
  location: z.string().trim().max(160).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  portal_visible: z.number().int().min(0).max(1).nullable().optional(),
  client_confirmed_at: z.string().datetime().nullable().optional(),
  cancellation_reason: z.string().trim().max(500).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const parsed = FiltersSchema.safeParse({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    clientId: searchParams.get("clientId") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ message: "Filtros invalidos." }, { status: 400 });
  }

  const items = await getAppointments(parsed.data);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });
  }

  const id = await createAppointment(parsed.data);
  return NextResponse.json({ id }, { status: 201 });
}
