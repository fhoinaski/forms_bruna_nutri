import { d1Execute, d1Query } from "@/lib/d1/client";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";

export type AppointmentWorkflowStep =
  | "confirmacao"
  | "lembrete_24h"
  | "preparo"
  | "pos_consulta";

export type AppointmentWorkflowStatus = "pendente" | "enviado" | "dispensado";

export interface AppointmentWorkflowItem {
  id: string;
  appointment_id: string;
  step_type: AppointmentWorkflowStep;
  channel: string;
  due_at: string;
  status: AppointmentWorkflowStatus;
  message: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  appointment_title: string;
  appointment_type: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
}

interface AppointmentForWorkflow {
  id: string;
  client_id: string | null;
  title: string;
  appointment_type: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  client_name: string | null;
}

function addHours(date: Date, hours: number) {
  const copy = new Date(date);
  copy.setHours(copy.getHours() + hours);
  return copy;
}

function formatPtDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function appointmentPlace(location: string | null) {
  if (!location) return "O local ou link sera confirmado pela equipe.";
  return `Local/link: ${location}.`;
}

function buildMessage(appointment: AppointmentForWorkflow, step: AppointmentWorkflowStep) {
  const name = appointment.client_name?.split(" ")[0] ?? "tudo bem";
  const when = formatPtDateTime(appointment.starts_at);
  const place = appointmentPlace(appointment.location);

  if (step === "confirmacao") {
    return `Oi, ${name}! Aqui e da Bruna Flores Nutri. Estou passando para confirmar seu atendimento ${appointment.title} em ${when}. ${place} Pode me responder confirmando se esta tudo certo?`;
  }
  if (step === "lembrete_24h") {
    return `Oi, ${name}! Passando para lembrar do seu atendimento com a Bruna Flores Nutri em ${when}. Se puder, traga suas principais duvidas e qualquer informacao importante da rotina alimentar. ${place}`;
  }
  if (step === "preparo") {
    return `Oi, ${name}! Para aproveitarmos melhor o atendimento de ${when}, deixe separado exames recentes, anotacoes da rotina e duvidas principais. A ideia e chegar com calma e clareza.`;
  }
  return `Oi, ${name}! Foi muito bom acompanhar voce no atendimento com a Bruna Flores Nutri. Passando para saber como ficaram as orientacoes e se existe alguma duvida inicial para ajustarmos com cuidado.`;
}

function workflowPlan(appointment: AppointmentForWorkflow) {
  const starts = new Date(appointment.starts_at);
  const ends = appointment.ends_at ? new Date(appointment.ends_at) : addHours(starts, 1);
  return [
    { step: "confirmacao" as const, dueAt: new Date().toISOString() },
    { step: "lembrete_24h" as const, dueAt: addHours(starts, -24).toISOString() },
    { step: "preparo" as const, dueAt: addHours(starts, -2).toISOString() },
    { step: "pos_consulta" as const, dueAt: addHours(ends, 2).toISOString() },
  ].map((item) => ({
    ...item,
    message: buildMessage(appointment, item.step),
  }));
}

async function getAppointmentForWorkflow(appointmentId: string) {
  return (
    await d1Query<AppointmentForWorkflow>(
      `SELECT a.id, a.client_id, a.title, a.appointment_type, a.starts_at, a.ends_at,
              a.location, c.name as client_name
       FROM appointments a
       LEFT JOIN clients c ON c.id = a.client_id
       WHERE a.id = ?1
       LIMIT 1`,
      [appointmentId]
    )
  )[0] ?? null;
}

export async function createStandardWorkflowForAppointment(appointmentId: string) {
  const appointment = await getAppointmentForWorkflow(appointmentId);
  if (!appointment) return false;
  const now = new Date().toISOString();

  for (const item of workflowPlan(appointment)) {
    await d1Execute(
      `INSERT OR IGNORE INTO appointment_workflow_items
        (id, appointment_id, step_type, channel, due_at, status, message, created_at, updated_at)
       VALUES (?1, ?2, ?3, 'whatsapp', ?4, 'pendente', ?5, ?6, ?7)`,
      [
        crypto.randomUUID(),
        appointment.id,
        item.step,
        item.dueAt,
        item.message,
        now,
        now,
      ]
    );
  }
  return true;
}

export async function refreshWorkflowForAppointment(appointmentId: string) {
  const appointment = await getAppointmentForWorkflow(appointmentId);
  if (!appointment) return;
  const now = new Date().toISOString();

  for (const item of workflowPlan(appointment)) {
    await d1Execute(
      `UPDATE appointment_workflow_items
       SET due_at = ?1, message = ?2, updated_at = ?3
       WHERE appointment_id = ?4 AND step_type = ?5 AND status = 'pendente'`,
      [item.dueAt, item.message, now, appointment.id, item.step]
    );
  }
}

export async function listAppointmentWorkflowItems(filters: {
  from?: string;
  to?: string;
  appointmentFrom?: string;
  appointmentTo?: string;
  status?: AppointmentWorkflowStatus;
  appointmentId?: string;
}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  if (filters.from) {
    conditions.push(`w.due_at >= ?${index++}`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`w.due_at <= ?${index++}`);
    params.push(filters.to);
  }
  if (filters.appointmentFrom) {
    conditions.push(`a.starts_at >= ?${index++}`);
    params.push(filters.appointmentFrom);
  }
  if (filters.appointmentTo) {
    conditions.push(`a.starts_at <= ?${index++}`);
    params.push(filters.appointmentTo);
  }
  if (filters.status) {
    conditions.push(`w.status = ?${index++}`);
    params.push(filters.status);
  }
  if (filters.appointmentId) {
    conditions.push(`w.appointment_id = ?${index++}`);
    params.push(filters.appointmentId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return d1Query<AppointmentWorkflowItem>(
    `SELECT w.*, a.title as appointment_title, a.appointment_type, a.starts_at,
            a.ends_at, a.location, c.id as client_id, c.name as client_name,
            c.phone as client_phone, c.email as client_email
     FROM appointment_workflow_items w
     INNER JOIN appointments a ON a.id = w.appointment_id
     LEFT JOIN clients c ON c.id = a.client_id
     ${where}
     ORDER BY w.due_at ASC
     LIMIT 250`,
    params
  );
}

export async function updateAppointmentWorkflowItem(
  id: string,
  input: { status: AppointmentWorkflowStatus; adminId?: string }
) {
  const now = new Date().toISOString();
  const existing = (
    await d1Query<{ id: string }>(
      "SELECT id FROM appointment_workflow_items WHERE id = ?1 LIMIT 1",
      [id]
    )
  )[0];
  if (!existing) return null;

  await d1Execute(
    `UPDATE appointment_workflow_items
     SET status = ?1, completed_at = CASE WHEN ?1 = 'pendente' THEN NULL ELSE ?2 END,
         updated_at = ?3
     WHERE id = ?4`,
    [input.status, now, now, id]
  );

  const item = (
    await d1Query<AppointmentWorkflowItem>(
      `SELECT w.*, a.title as appointment_title, a.appointment_type, a.starts_at,
              a.ends_at, a.location, c.id as client_id, c.name as client_name,
              c.phone as client_phone, c.email as client_email
       FROM appointment_workflow_items w
       INNER JOIN appointments a ON a.id = w.appointment_id
       LEFT JOIN clients c ON c.id = a.client_id
       WHERE w.id = ?1
       LIMIT 1`,
      [id]
    )
  )[0];

  if (item?.client_id && input.status !== "pendente") {
    await addTimelineEvent({
      client_id: item.client_id,
      type: "communication",
      title: input.status === "enviado" ? "Mensagem enviada" : "Mensagem dispensada",
      description: `${workflowStepLabel(item.step_type)} - ${item.appointment_title}`,
      metadata: {
        appointmentId: item.appointment_id,
        workflowItemId: item.id,
        status: input.status,
        adminId: input.adminId,
      },
    });
  }

  return item ?? null;
}

export function workflowStepLabel(step: AppointmentWorkflowStep) {
  const labels: Record<AppointmentWorkflowStep, string> = {
    confirmacao: "Confirmacao",
    lembrete_24h: "Lembrete 24h",
    preparo: "Preparo",
    pos_consulta: "Pos-consulta",
  };
  return labels[step];
}
