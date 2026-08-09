import { d1Execute, d1Query } from "@/lib/d1/client";
import type { Appointment } from "@/lib/repositories/appointments";

export type AvailabilityRule = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export type AvailabilityBlock = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateAvailabilityRuleInput = {
  weekday: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes?: number;
  is_active?: number;
};

export type CreateAvailabilityBlockInput = {
  starts_at: string;
  ends_at: string;
  reason?: string | null;
};

const MAX_RANGE_DAYS = 30;
const DEFAULT_APPOINTMENT_MINUTES = 60;
const SAO_PAULO_OFFSET = "-03:00";

function startOfLocalDate(date: Date) {
  return new Date(`${dateKey(date)}T00:00:00${SAO_PAULO_OFFSET}`);
}

function parseDateInput(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00${SAO_PAULO_OFFSET}`);
  }
  return startOfLocalDate(new Date(value));
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function weekdayNumber(date: Date) {
  const label = date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" });
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

function localDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00${SAO_PAULO_OFFSET}`);
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

function assertRange(fromDate: string, toDate: string) {
  const from = parseDateInput(fromDate);
  const to = parseDateInput(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Intervalo invalido.");
  }
  if (to < from) {
    throw new Error("Data final anterior a data inicial.");
  }
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new Error(`Intervalo maximo de ${MAX_RANGE_DAYS} dias.`);
  }
  return { from, to };
}

export async function listAvailabilityRules() {
  return d1Query<AvailabilityRule>(
    "SELECT * FROM availability_rules ORDER BY weekday ASC, start_time ASC",
    []
  );
}

export async function createAvailabilityRule(input: CreateAvailabilityRuleInput) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO availability_rules
      (id, weekday, start_time, end_time, slot_duration_minutes, is_active, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    [
      id,
      input.weekday,
      input.start_time,
      input.end_time,
      input.slot_duration_minutes ?? DEFAULT_APPOINTMENT_MINUTES,
      input.is_active ?? 1,
      now,
      now,
    ]
  );
  return id;
}

export async function updateAvailabilityRule(id: string, input: Partial<CreateAvailabilityRuleInput>) {
  const updates: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      updates.push(`${key} = ?${index++}`);
      params.push(value);
    }
  }
  if (!updates.length) return;
  updates.push(`updated_at = ?${index++}`);
  params.push(new Date().toISOString());
  params.push(id);
  await d1Execute(`UPDATE availability_rules SET ${updates.join(", ")} WHERE id = ?${index}`, params);
}

export async function deleteAvailabilityRule(id: string) {
  await d1Execute("DELETE FROM availability_rules WHERE id = ?1", [id]);
}

export async function listAvailabilityBlocks() {
  return d1Query<AvailabilityBlock>(
    "SELECT * FROM availability_blocks ORDER BY starts_at ASC LIMIT 250",
    []
  );
}

export async function createAvailabilityBlock(input: CreateAvailabilityBlockInput) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await d1Execute(
    `INSERT INTO availability_blocks
      (id, starts_at, ends_at, reason, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    [id, input.starts_at, input.ends_at, input.reason ?? null, now, now]
  );
  return id;
}

export async function updateAvailabilityBlock(id: string, input: Partial<CreateAvailabilityBlockInput>) {
  const updates: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      updates.push(`${key} = ?${index++}`);
      params.push(value);
    }
  }
  if (!updates.length) return;
  updates.push(`updated_at = ?${index++}`);
  params.push(new Date().toISOString());
  params.push(id);
  await d1Execute(`UPDATE availability_blocks SET ${updates.join(", ")} WHERE id = ?${index}`, params);
}

export async function deleteAvailabilityBlock(id: string) {
  await d1Execute("DELETE FROM availability_blocks WHERE id = ?1", [id]);
}

export async function getAvailableSlots(
  fromDate: string,
  toDate: string
): Promise<Array<{ date: string; slots: string[] }>> {
  const { from, to } = assertRange(fromDate, toDate);
  const rangeStart = from.toISOString();
  const rangeEnd = addMinutes(to, 24 * 60).toISOString();

  const [rules, appointments, blocks] = await Promise.all([
    d1Query<AvailabilityRule>("SELECT * FROM availability_rules WHERE is_active = 1", []),
    d1Query<Appointment>(
      `SELECT a.*, c.name as client_name, c.phone as client_phone, c.email as client_email
       FROM appointments a
       LEFT JOIN clients c ON c.id = a.client_id
       WHERE a.status != 'cancelado'
         AND a.starts_at < ?1
         AND COALESCE(a.ends_at, datetime(a.starts_at, '+60 minutes')) > ?2
       ORDER BY a.starts_at ASC`,
      [rangeEnd, rangeStart]
    ),
    d1Query<AvailabilityBlock>(
      `SELECT * FROM availability_blocks
       WHERE starts_at < ?1 AND ends_at > ?2
       ORDER BY starts_at ASC`,
      [rangeEnd, rangeStart]
    ),
  ]);

  const byDate: Array<{ date: string; slots: string[] }> = [];
  const now = new Date();

  for (let day = new Date(from); day <= to; day = addMinutes(day, 24 * 60)) {
    const key = dateKey(day);
    const dayRules = rules.filter((rule) => rule.weekday === weekdayNumber(day));
    const slots: string[] = [];

    for (const rule of dayRules) {
      let cursor = localDateTime(key, rule.start_time);
      const end = localDateTime(key, rule.end_time);
      const duration = Math.max(15, rule.slot_duration_minutes || DEFAULT_APPOINTMENT_MINUTES);

      while (addMinutes(cursor, duration) <= end) {
        const slotEnd = addMinutes(cursor, duration);
        const occupied = appointments.some((appointment) => {
          const appointmentStart = new Date(appointment.starts_at);
          const appointmentEnd = appointment.ends_at ? new Date(appointment.ends_at) : addMinutes(appointmentStart, duration);
          return overlaps(cursor, slotEnd, appointmentStart, appointmentEnd);
        });
        const blocked = blocks.some((block) => overlaps(cursor, slotEnd, new Date(block.starts_at), new Date(block.ends_at)));
        if (!occupied && !blocked && cursor > now) {
          slots.push(cursor.toISOString());
        }
        cursor = slotEnd;
      }
    }

    byDate.push({ date: key, slots: Array.from(new Set(slots)).sort() });
  }

  return byDate;
}

export async function hasAppointmentConflict(startsAt: string, endsAt: string) {
  const rows = await d1Query<{ c: number }>(
    `SELECT COUNT(*) as c
     FROM appointments
     WHERE status != 'cancelado'
       AND starts_at < ?1
       AND COALESCE(ends_at, datetime(starts_at, '+60 minutes')) > ?2`,
    [endsAt, startsAt]
  );
  return (rows[0]?.c ?? 0) > 0;
}

export async function countFutureClientAppointments(clientId: string) {
  const rows = await d1Query<{ c: number }>(
    `SELECT COUNT(*) as c
     FROM appointments
     WHERE client_id = ?1
       AND starts_at >= ?2
       AND status IN ('agendado', 'confirmado')`,
    [clientId, new Date().toISOString()]
  );
  return rows[0]?.c ?? 0;
}

export function slotEnd(startsAt: string, minutes = DEFAULT_APPOINTMENT_MINUTES) {
  return addMinutes(new Date(startsAt), minutes).toISOString();
}
