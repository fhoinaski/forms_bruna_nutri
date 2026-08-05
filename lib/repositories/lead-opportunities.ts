import { d1Execute, d1Query } from "@/lib/d1/client";
import { getSubmissionById } from "@/lib/repositories/submissions";

export type OpportunityStage =
  | "novo"
  | "acolhimento"
  | "aguardando_resposta"
  | "agendado"
  | "convertido"
  | "perdido";

export type OpportunityTemperature = "frio" | "morno" | "quente";

export interface LeadOpportunity {
  id: string;
  submission_id: string;
  stage: OpportunityStage;
  temperature: OpportunityTemperature;
  source: string;
  objective: string | null;
  service_interest: string | null;
  next_action_at: string | null;
  last_contacted_at: string | null;
  contact_attempts: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  patient_name: string;
  patient_email: string | null;
  patient_phone: string | null;
  child_name: string | null;
  submission_status: string;
  submission_created_at: string;
}

export interface OpportunityMetrics {
  total: number;
  novos: number;
  quentes: number;
  atrasadas: number;
  convertidas: number;
}

function firstString(answers: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = answers[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function inferTemperature(answers: Record<string, unknown>): OpportunityTemperature {
  const text = Object.values(answers).join(" ").toLowerCase();
  if (
    text.includes("urgente") ||
    text.includes("dificil") ||
    text.includes("difícil") ||
    text.includes("medo") ||
    text.includes("seletividade") ||
    text.includes("tea")
  ) {
    return "quente";
  }
  if (text.includes("duvida") || text.includes("dúvida") || text.includes("rotina")) return "morno";
  return "morno";
}

function defaultNextAction(createdAt: string) {
  const date = new Date(createdAt);
  date.setHours(date.getHours() + 4);
  return date.toISOString();
}

export async function ensureOpportunityForSubmission(submissionId: string) {
  const existing = (
    await d1Query<{ id: string }>(
      "SELECT id FROM lead_opportunities WHERE submission_id = ?1 LIMIT 1",
      [submissionId]
    )
  )[0];
  if (existing) return existing.id;

  const submission = await getSubmissionById(submissionId);
  if (!submission) return null;

  const answers = submission.answers as Record<string, unknown>;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await d1Execute(
    `INSERT INTO lead_opportunities
      (id, submission_id, stage, temperature, source, objective, service_interest,
       next_action_at, last_contacted_at, contact_attempts, notes, created_at, updated_at)
     VALUES (?1, ?2, 'novo', ?3, 'pre_consulta', ?4, ?5, ?6, NULL, 0, NULL, ?7, ?8)`,
    [
      id,
      submissionId,
      inferTemperature(answers),
      firstString(answers, ["objetivo", "motivacao", "expectativas"]),
      firstString(answers, ["tipoAtendimento"]),
      defaultNextAction(submission.created_at),
      now,
      now,
    ]
  );
  return id;
}

export async function backfillLeadOpportunities(limit = 200) {
  const rows = await d1Query<{ id: string }>(
    `SELECT s.id
     FROM form_submissions s
     LEFT JOIN lead_opportunities o ON o.submission_id = s.id
     WHERE o.id IS NULL
     ORDER BY s.created_at DESC
     LIMIT ?1`,
    [limit]
  );

  let created = 0;
  for (const row of rows) {
    const id = await ensureOpportunityForSubmission(row.id);
    if (id) created++;
  }
  return created;
}

export async function listLeadOpportunities(filters: {
  stage?: OpportunityStage;
  temperature?: OpportunityTemperature;
  search?: string;
}) {
  await backfillLeadOpportunities(200);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let index = 1;

  if (filters.stage) {
    conditions.push(`o.stage = ?${index++}`);
    params.push(filters.stage);
  }
  if (filters.temperature) {
    conditions.push(`o.temperature = ?${index++}`);
    params.push(filters.temperature);
  }
  if (filters.search) {
    conditions.push(`(s.patient_name LIKE ?${index} OR s.patient_email LIKE ?${index} OR s.patient_phone LIKE ?${index} OR o.objective LIKE ?${index})`);
    params.push(`%${filters.search}%`);
    index++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return d1Query<LeadOpportunity>(
    `SELECT o.*, s.patient_name, s.patient_email, s.patient_phone, s.child_name,
            s.status as submission_status, s.created_at as submission_created_at
     FROM lead_opportunities o
     INNER JOIN form_submissions s ON s.id = o.submission_id
     ${where}
     ORDER BY
       CASE o.stage
         WHEN 'novo' THEN 0
         WHEN 'acolhimento' THEN 1
         WHEN 'aguardando_resposta' THEN 2
         WHEN 'agendado' THEN 3
         WHEN 'convertido' THEN 4
         ELSE 5
       END,
       COALESCE(o.next_action_at, o.created_at) ASC
     LIMIT 300`,
    params
  );
}

export async function getLeadOpportunityById(id: string) {
  return (
    await d1Query<LeadOpportunity>(
      `SELECT o.*, s.patient_name, s.patient_email, s.patient_phone, s.child_name,
              s.status as submission_status, s.created_at as submission_created_at
       FROM lead_opportunities o
       INNER JOIN form_submissions s ON s.id = o.submission_id
       WHERE o.id = ?1
       LIMIT 1`,
      [id]
    )
  )[0] ?? null;
}

export async function getLeadOpportunityBySubmissionId(submissionId: string) {
  return (
    await d1Query<LeadOpportunity>(
      `SELECT o.*, s.patient_name, s.patient_email, s.patient_phone, s.child_name,
              s.status as submission_status, s.created_at as submission_created_at
       FROM lead_opportunities o
       INNER JOIN form_submissions s ON s.id = o.submission_id
       WHERE o.submission_id = ?1
       LIMIT 1`,
      [submissionId]
    )
  )[0] ?? null;
}

export async function markOpportunityConvertedBySubmissionId(submissionId: string) {
  const opportunityId = await ensureOpportunityForSubmission(submissionId);
  if (!opportunityId) return null;
  return updateLeadOpportunity(opportunityId, {
    stage: "convertido",
    nextActionAt: null,
  });
}

export async function updateLeadOpportunity(
  id: string,
  input: {
    stage?: OpportunityStage;
    temperature?: OpportunityTemperature;
    nextActionAt?: string | null;
    notes?: string | null;
    contacted?: boolean;
    adminId?: string;
  }
) {
  const existing = await getLeadOpportunityById(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  const now = new Date().toISOString();

  if (input.stage !== undefined) {
    updates.push(`stage = ?${index++}`);
    params.push(input.stage);
  }
  if (input.temperature !== undefined) {
    updates.push(`temperature = ?${index++}`);
    params.push(input.temperature);
  }
  if (input.nextActionAt !== undefined) {
    updates.push(`next_action_at = ?${index++}`);
    params.push(input.nextActionAt);
  }
  if (input.notes !== undefined) {
    updates.push(`notes = ?${index++}`);
    params.push(input.notes);
  }
  if (input.contacted) {
    updates.push(`last_contacted_at = ?${index++}`);
    params.push(now);
    updates.push(`contact_attempts = contact_attempts + 1`);
  }
  if (!updates.length) return null;

  updates.push(`updated_at = ?${index++}`);
  params.push(now);
  params.push(id);
  await d1Execute(`UPDATE lead_opportunities SET ${updates.join(", ")} WHERE id = ?${index}`, params);

  const item = await getLeadOpportunityById(id);
  if (item?.stage === "convertido") {
    await d1Execute("UPDATE form_submissions SET status = 'finalizado', updated_at = ?1 WHERE id = ?2", [now, item.submission_id]);
  } else if (item && input.stage && ["acolhimento", "aguardando_resposta", "agendado"].includes(input.stage)) {
    await d1Execute("UPDATE form_submissions SET status = 'em_andamento', updated_at = ?1 WHERE id = ?2 AND status = 'novo'", [now, item.submission_id]);
  }

  return item;
}

export async function getLeadOpportunityMetrics(): Promise<OpportunityMetrics> {
  await backfillLeadOpportunities(200);
  const now = new Date().toISOString();
  const [total, novos, quentes, atrasadas, convertidas] = await Promise.all([
    d1Query<{ c: number }>("SELECT COUNT(*) as c FROM lead_opportunities", []),
    d1Query<{ c: number }>("SELECT COUNT(*) as c FROM lead_opportunities WHERE stage = 'novo'", []),
    d1Query<{ c: number }>("SELECT COUNT(*) as c FROM lead_opportunities WHERE temperature = 'quente' AND stage NOT IN ('convertido', 'perdido')", []),
    d1Query<{ c: number }>("SELECT COUNT(*) as c FROM lead_opportunities WHERE next_action_at IS NOT NULL AND next_action_at < ?1 AND stage NOT IN ('convertido', 'perdido')", [now]),
    d1Query<{ c: number }>("SELECT COUNT(*) as c FROM lead_opportunities WHERE stage = 'convertido'", []),
  ]);
  return {
    total: total[0]?.c ?? 0,
    novos: novos[0]?.c ?? 0,
    quentes: quentes[0]?.c ?? 0,
    atrasadas: atrasadas[0]?.c ?? 0,
    convertidas: convertidas[0]?.c ?? 0,
  };
}

export function buildOpportunityMessage(opportunity: LeadOpportunity) {
  const firstName = opportunity.patient_name.split(" ")[0] || "tudo bem";
  const interest = opportunity.service_interest ? ` sobre ${opportunity.service_interest.toLowerCase()}` : "";
  return `Oi, ${firstName}! Aqui e da Bruna Flores Nutri. Recebi sua pre-consulta${interest} e li com cuidado o que voce compartilhou. Queria entender melhor seu momento e te orientar sobre o melhor proximo passo. Podemos conversar por aqui?`;
}

export function opportunityWhatsappUrl(opportunity: Pick<LeadOpportunity, "patient_phone">, message: string) {
  if (!opportunity.patient_phone) return null;
  const digits = opportunity.patient_phone.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
