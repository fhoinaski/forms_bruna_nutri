import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
import { createAppointment } from "@/lib/repositories/appointments";
import {
  countFutureClientAppointments,
  getAvailableSlots,
  hasAppointmentConflict,
  slotEnd,
} from "@/lib/repositories/availability";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";
import { getSaoPauloDateKey } from "@/lib/utils/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ScheduleSchema = z.object({
  starts_at: z.string().datetime(),
});

function defaultRange(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const today = new Date();
  const future = new Date(today);
  future.setDate(future.getDate() + 14);
  return {
    from: from ?? getSaoPauloDateKey(today),
    to: to ?? getSaoPauloDateKey(future),
  };
}

export async function GET(req: NextRequest) {
  const session = await getClientPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  try {
    const { from, to } = defaultRange(req);
    const days = await getAvailableSlots(from, to);
    return NextResponse.json({ days });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Nao foi possivel listar horarios." },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getClientPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const limit = await consumeRateLimit(req, {
    scope: "portal-appointment-schedule",
    limit: 6,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { message: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const parsed = ScheduleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Horario invalido." }, { status: 400 });

  const startsAt = parsed.data.starts_at;
  const starts = new Date(startsAt);
  if (Number.isNaN(starts.getTime()) || starts <= new Date()) {
    return NextResponse.json({ message: "Escolha um horario futuro." }, { status: 400 });
  }

  const end = slotEnd(startsAt);
  const futureCount = await countFutureClientAppointments(session.sub);
  // Regra simples antiabuso: a paciente pode ter apenas uma consulta futura ativa
  // por vez no autoagendamento. A admin continua podendo ajustar a agenda manualmente.
  if (futureCount >= 1) {
    return NextResponse.json({ message: "Voce ja possui uma consulta futura agendada." }, { status: 409 });
  }

  const rangeDate = startsAt.slice(0, 10);
  const availability = await getAvailableSlots(rangeDate, rangeDate);
  const available = availability.some((day) => day.slots.includes(startsAt));
  if (!available || await hasAppointmentConflict(startsAt, end)) {
    return NextResponse.json({ message: "Horario indisponivel. Escolha outro horario." }, { status: 409 });
  }

  const id = await createAppointment({
    client_id: session.sub,
    title: "Consulta nutricional",
    appointment_type: "consulta",
    starts_at: startsAt,
    ends_at: end,
    status: "agendado",
    portal_visible: 1,
    notes: "Consulta marcada pela paciente no portal.",
  });

  await addTimelineEvent({
    client_id: session.sub,
    type: "appointment",
    title: "Consulta marcada pelo portal",
    description: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(starts),
    metadata: { appointmentId: id, source: "client_portal" },
  });

  await writeAuditLog({
    action: "portal_appointment_created",
    entityType: "appointment",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { source: "client_portal" },
  });

  return NextResponse.json({ id }, { status: 201 });
}
