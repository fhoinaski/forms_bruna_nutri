import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  createStandardWorkflowForAppointment,
  listAppointmentWorkflowItems,
} from "@/lib/repositories/appointment-workflows";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.enum(["pendente", "enviado", "dispensado"]);

const filtersSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  appointmentFrom: z.string().datetime().optional(),
  appointmentTo: z.string().datetime().optional(),
  status: statusSchema.optional(),
  channel: z.string().max(40).optional(),
  appointmentId: z.string().max(100).optional(),
});

const createSchema = z.object({
  appointmentId: z.string().min(1).max(100),
});

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = filtersSchema.safeParse({
    from: req.nextUrl.searchParams.get("from") ?? undefined,
    to: req.nextUrl.searchParams.get("to") ?? undefined,
    appointmentFrom: req.nextUrl.searchParams.get("appointmentFrom") ?? undefined,
    appointmentTo: req.nextUrl.searchParams.get("appointmentTo") ?? undefined,
    status: req.nextUrl.searchParams.get("status") ?? undefined,
    channel: req.nextUrl.searchParams.get("channel") ?? undefined,
    appointmentId: req.nextUrl.searchParams.get("appointmentId") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ message: "Filtros invalidos." }, { status: 400 });

  const items = await listAppointmentWorkflowItems(parsed.data);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  const created = await createStandardWorkflowForAppointment(parsed.data.appointmentId);
  if (!created) return NextResponse.json({ message: "Consulta nao encontrada." }, { status: 404 });
  await writeAuditLog({
    action: "appointment_workflow_created",
    adminId: admin.sub,
    entityType: "appointment",
    entityId: parsed.data.appointmentId,
    ipHash: getRequestFingerprint(req).ipHash,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
