import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { d1Execute, d1Query } from "@/lib/d1/client";
import type { Client } from "@/lib/repositories/clients";
import type { Appointment } from "@/lib/repositories/appointments";
import type { ClientTask } from "@/lib/repositories/client-tasks";
import { getExistingNutritionRecord, type NutritionRecord } from "@/lib/repositories/nutrition-records";
import type { Payment } from "@/lib/repositories/payments";
import { getActiveMealPlan, type MealPlanPayload, type MealPlanMealPayload } from "@/lib/repositories/meal-plans";
import { getRecipeById } from "@/lib/repositories/recipes";
import { listApprovedAlternativesForPlan } from "@/lib/repositories/exchange-groups";

export interface ClientPortalAccess {
  id: string;
  client_id: string;
  code_hash: string;
  is_active: number;
  session_version: number;
  last_used_at: string | null;
  code_expires_at: string | null;
  invited_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalProtocol {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  protocol_title: string | null;
  protocol_description: string | null;
  protocol_category: string | null;
  phases: Array<{
    id: string;
    title: string;
    days: string | null;
    objective: string | null;
    actions: string[];
    notes: string | null;
  }>;
}

/**
 * Food-First Meal Plan V1, Fase 8 — mesma semântica do print (Fase 7): o
 * paciente vê o nome humano da receita aceita + modo de preparo, nunca só
 * os nomes técnicos crus dos ingredientes. Os itens/cálculo continuam
 * exatamente os da refeição (nada muda em `items`/nutrição) — só um campo
 * de apresentação a mais quando `source_recipe_id` está presente.
 */
export type PortalMealPayload = MealPlanMealPayload & { recipe: { title: string; preparation_steps: string | null } | null };

export interface ClientPortalSummary {
  client: Pick<Client, "id" | "name" | "email" | "phone">;
  appointments: Appointment[];
  tasks: ClientTask[];
  protocols: PortalProtocol[];
  carePlan: Pick<NutritionRecord, "goals" | "care_plan" | "hydration" | "physical_activity" | "sleep_routine"> | null;
  mealPlan: (Omit<MealPlanPayload, "meals"> & { meals: PortalMealPayload[] }) | null;
  /** FASE 7 (item 22) — só grupos de troca com pelo menos 1 alternativa APPROVED; cada grupo só traz as alternativas aprovadas, nunca SUGGESTED/EDITED/REJECTED. */
  exchangeGroups: Array<{
    id: string;
    primaryFoodName: string;
    foodGroup: string;
    approvedAlternatives: Array<{ id: string; foodName: string; quantityGrams: number }>;
  }>;
  payments: Pick<Payment, "id" | "description" | "amount_cents" | "due_date" | "status" | "payment_link" | "receipt_url" | "installment_number" | "installment_total">[];
}

export function normalizePortalCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashPortalCode(code: string): string {
  const secret = process.env.AUTH_SECRET ?? "local-development";
  return createHmac("sha256", secret).update(normalizePortalCode(code)).digest("hex");
}

export function verifyPortalCodeHash(code: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPortalCode(code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function generatePortalCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let suffix = "";
  for (let index = 0; index < 8; index++) {
    suffix += alphabet[bytes[index] % alphabet.length];
  }
  return `BF-${suffix.slice(0, 4)}-${suffix.slice(4)}`;
}

export async function getClientPortalAccess(clientId: string): Promise<ClientPortalAccess | null> {
  const rows = await d1Query<ClientPortalAccess>(
    "SELECT * FROM client_portal_access WHERE client_id = ?1 LIMIT 1",
    [clientId]
  );
  return rows[0] ?? null;
}

export async function createOrRotateClientPortalCode(clientId: string) {
  const code = generatePortalCode();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const existing = await getClientPortalAccess(clientId);

  if (existing) {
    await d1Execute(
      `UPDATE client_portal_access
       SET code_hash = ?1, is_active = 1, updated_at = ?2
           , session_version = session_version + 1, code_expires_at = ?3, invited_at = ?2, revoked_at = NULL
       WHERE client_id = ?4`,
      [hashPortalCode(code), now, expiresAt, clientId]
    );
    return { code, accessId: existing.id };
  }

  const id = crypto.randomUUID();
  await d1Execute(
    `INSERT INTO client_portal_access
      (id, client_id, code_hash, is_active, session_version, created_at, updated_at)
     VALUES (?1, ?2, ?3, 1, 1, ?4, ?5)`,
    [id, clientId, hashPortalCode(code), now, now]
  );
  await d1Execute(
    "UPDATE client_portal_access SET code_expires_at = ?1, invited_at = ?2 WHERE id = ?3",
    [expiresAt, now, id]
  );
  return { code, accessId: id };
}

export async function setClientPortalAccessActive(clientId: string, active: boolean) {
  await d1Execute(
    "UPDATE client_portal_access SET is_active = ?1, session_version = session_version + 1, revoked_at = ?2, updated_at = ?3 WHERE client_id = ?4",
    [active ? 1 : 0, active ? null : new Date().toISOString(), new Date().toISOString(), clientId]
  );
}

export async function verifyClientPortalLogin(email: string, code: string): Promise<{ client: Client; sessionVersion: number } | null> {
  const rows = await d1Query<Client & { code_hash: string; portal_active: number; portal_session_version: number }>(
    `SELECT c.*, p.code_hash, p.is_active as portal_active, p.session_version as portal_session_version
     FROM clients c
     INNER JOIN client_portal_access p ON p.client_id = c.id
     WHERE lower(c.email) = ?1
     LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  const client = rows[0];
  if (!client || client.portal_active !== 1) return null;
  const access = await getClientPortalAccess(client.id);
  if (access?.code_expires_at && Date.parse(access.code_expires_at) < Date.now()) return null;
  if (!verifyPortalCodeHash(code, client.code_hash)) return null;

  await d1Execute(
    "UPDATE client_portal_access SET last_used_at = ?1, updated_at = ?2 WHERE client_id = ?3",
    [new Date().toISOString(), new Date().toISOString(), client.id]
  );
  return { client, sessionVersion: client.portal_session_version };
}

export async function getClientPortalSummary(clientId: string): Promise<ClientPortalSummary | null> {
  const clients = await d1Query<Client>(
    "SELECT id, name, email, phone, birth_date, source_submission_id, status, notes, created_at, updated_at FROM clients WHERE id = ?1 AND status != 'arquivado' LIMIT 1",
    [clientId]
  );
  const client = clients[0];
  if (!client) return null;

  const [appointments, tasks, protocols, carePlan, mealPlan, payments] = await Promise.all([
    d1Query<Appointment>(
      `SELECT a.*, c.name as client_name, c.phone as client_phone, c.email as client_email
       FROM appointments a
       LEFT JOIN clients c ON c.id = a.client_id
       WHERE a.client_id = ?1 AND a.status != 'cancelado' AND COALESCE(a.portal_visible, 1) = 1
       ORDER BY a.starts_at ASC
       LIMIT 12`,
      [clientId]
    ),
    d1Query<ClientTask>(
      `SELECT * FROM client_tasks
       WHERE client_id = ?1 AND status != 'cancelada'
       ORDER BY CASE WHEN status = 'pendente' THEN 0 ELSE 1 END, due_date ASC, created_at ASC
       LIMIT 40`,
      [clientId]
    ),
    getPortalProtocols(clientId),
    getExistingNutritionRecord(clientId),
    getActiveMealPlan(clientId),
    d1Query<Pick<Payment, "id" | "description" | "amount_cents" | "due_date" | "status" | "payment_link" | "receipt_url" | "installment_number" | "installment_total">>(
      `SELECT id, description, amount_cents, due_date, status, payment_link, receipt_url, installment_number, installment_total
       FROM payments
       WHERE client_id = ?1 AND status != 'cancelado'
       ORDER BY CASE WHEN status IN ('pendente', 'vencido') THEN 0 ELSE 1 END, COALESCE(due_date, created_at) ASC
       LIMIT 12`,
      [clientId]
    ),
  ]);

  const mealsWithRecipe: PortalMealPayload[] = mealPlan
    ? await Promise.all(mealPlan.meals.map(async (meal) => ({
        ...meal,
        recipe: meal.source_recipe_id
          ? await getRecipeById(meal.source_recipe_id).then((r) => r ? { title: r.title, preparation_steps: r.preparation_steps } : null)
          : null,
      })))
    : [];

  // FASE 7 (item 22) — mesma regra de "só aprovado sai pro portal" já
  // aplicada acima pras substituições legadas, agora pros grupos de troca.
  const exchangeGroupsForPortal = mealPlan ? await listApprovedAlternativesForPlan(mealPlan.id) : [];

  return {
    client: { id: client.id, name: client.name, email: client.email, phone: client.phone },
    appointments,
    tasks,
    protocols,
    carePlan: carePlan ? {
      goals: carePlan.goals,
      care_plan: carePlan.care_plan,
      hydration: carePlan.hydration,
      physical_activity: carePlan.physical_activity,
      sleep_routine: carePlan.sleep_routine,
    } : null,
    // O paciente só pode ver substituições já aprovadas pela nutricionista —
    // sugestões pendentes (IA ou manuais ainda não revisadas) nunca saem do
    // servidor pro portal (seção 17/20 do pedido: paciente não aprova nem
    // altera equivalência clínica, e nada sem revisão profissional chega até ele).
    mealPlan: mealPlan ? { ...mealPlan, meals: mealsWithRecipe, substitutions: mealPlan.substitutions.filter((item) => item.approved_by_professional !== false) } : null,
    exchangeGroups: exchangeGroupsForPortal.map(({ group, approved }) => ({
      id: group.id,
      primaryFoodName: group.primary_food_name,
      foodGroup: group.food_group,
      approvedAlternatives: approved.map((a) => ({ id: a.id, foodName: a.food_name, quantityGrams: a.quantity_grams })),
    })),
    payments,
  };
}

async function getPortalProtocols(clientId: string): Promise<PortalProtocol[]> {
  const rows = await d1Query<Omit<PortalProtocol, "phases"> & { protocol_id: string }>(
    `SELECT cp.id, cp.protocol_id, cp.status, cp.started_at, cp.completed_at,
            p.title as protocol_title, p.description as protocol_description, p.category as protocol_category
     FROM client_protocols cp
     LEFT JOIN protocols p ON p.id = cp.protocol_id
     WHERE cp.client_id = ?1 AND cp.status != 'cancelado'
     ORDER BY cp.created_at DESC
     LIMIT 8`,
    [clientId]
  );

  const protocols: PortalProtocol[] = [];
  for (const row of rows) {
    const phases = await d1Query<{
      id: string;
      title: string;
      days: string | null;
      objective: string | null;
      actions_json: string;
      notes: string | null;
    }>(
      `SELECT id, title, days, objective, actions_json, notes
       FROM protocol_phases WHERE protocol_id = ?1 ORDER BY phase_order ASC`,
      [row.protocol_id]
    );
    protocols.push({
      id: row.id,
      status: row.status,
      started_at: row.started_at,
      completed_at: row.completed_at,
      protocol_title: row.protocol_title,
      protocol_description: row.protocol_description,
      protocol_category: row.protocol_category,
      phases: phases.map((phase) => {
        let actions: string[] = [];
        try {
          actions = JSON.parse(phase.actions_json) as string[];
        } catch {}
        return {
          id: phase.id,
          title: phase.title,
          days: phase.days,
          objective: phase.objective,
          actions,
          notes: phase.notes,
        };
      }),
    });
  }
  return protocols;
}
