import type { APIRequestContext } from "@playwright/test";

/** Sufixo unico por chamada — nunca reusa dado de uma execucao anterior, nunca colide entre testes paralelos. */
export function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function expectOk(response: { ok(): boolean; status(): number; text(): Promise<string> }, label: string) {
  if (!response.ok()) {
    throw new Error(`${label} falhou (${response.status()}): ${await response.text()}`);
  }
}

export interface TestPatient {
  id: string;
  name: string;
  email: string;
  phone: string;
}

/**
 * Numero de telefone unico por chamada — client_phone_normalized tem
 * indice UNIQUE, e o timestamp sozinho (Date.now()) nao basta: os
 * primeiros digitos de um timestamp em ms mudam devagar (escala de
 * ano/mes), entao pegar so os primeiros N digitos colide facilmente entre
 * chamadas paralelas na mesma execucao. Usa os digitos MENOS
 * significativos (mais volateis) + um sufixo aleatorio.
 */
export function uniquePhone(): string {
  const timePart = String(Date.now()).slice(-8);
  const randomPart = String(Math.floor(Math.random() * 900) + 100);
  return `11${timePart}${randomPart}`;
}

export async function createTestPatient(api: APIRequestContext, overrides: Partial<{ name: string; email: string; phone: string }> = {}): Promise<TestPatient> {
  const suffix = uniqueSuffix();
  const name = overrides.name ?? `E2E Paciente ${suffix}`;
  const email = overrides.email ?? `e2e-patient-${suffix}@test.local`;
  const phone = overrides.phone ?? uniquePhone();

  const response = await api.post("/api/admin/clients", {
    data: { name, email, phone, birth_date: "1990-05-15", notes: "Criado por E2E." },
  });
  await expectOk(response, "createTestPatient");
  const body = (await response.json()) as { id: string };
  return { id: body.id, name, email, phone };
}

export async function createTestAppointment(api: APIRequestContext, clientId: string, overrides: Partial<{ title: string; startsAt: string }> = {}) {
  const startsAt = overrides.startsAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const response = await api.post("/api/admin/appointments", {
    data: {
      client_id: clientId,
      title: overrides.title ?? "Consulta E2E",
      appointment_type: "consulta",
      starts_at: startsAt,
      status: "agendado",
    },
  });
  await expectOk(response, "createTestAppointment");
  const body = (await response.json()) as { id: string };
  return { id: body.id, startsAt };
}

export interface TestSubmission {
  id: string;
  patientName: string;
  email: string;
}

/**
 * Envia uma pre-consulta via a MESMA API publica que o formulario real usa
 * (POST /api/form-submissions) — nao dirige o wizard de UI (830 linhas,
 * multi-etapas) para nao acoplar o teste a selecionadores frageis de um
 * formulario extenso; o que este teste valida (persistencia real, listagem
 * administrativa, conversao para cliente) e identico independente de como
 * o payload chegou ao endpoint.
 */
export async function createTestSubmission(api: APIRequestContext, overrides: Partial<{ nome: string; email: string; whatsapp: string }> = {}): Promise<TestSubmission> {
  const suffix = uniqueSuffix();
  const nome = overrides.nome ?? `E2E PréConsulta ${suffix}`;
  const email = overrides.email ?? `e2e-submission-${suffix}@test.local`;
  // Precisa ser unico por chamada, nao um numero fixo: converter uma
  // submissao em cliente cria um registro com este telefone e
  // clients.phone_normalized tem indice UNIQUE — duas submissoes com o
  // mesmo numero (ex.: os dois projetos do Playwright rodando o mesmo
  // teste em paralelo) colidiam de verdade na conversao para cliente.
  const whatsapp = overrides.whatsapp ?? uniquePhone();

  const response = await api.post("/api/form-submissions", {
    data: { nome, email, whatsapp, privacyAccepted: true, companyWebsite: "" },
  });
  await expectOk(response, "createTestSubmission");
  const body = (await response.json()) as { id: string };
  return { id: body.id, patientName: nome, email };
}

export async function enablePortalAccess(api: APIRequestContext, clientId: string): Promise<{ code: string }> {
  const response = await api.post(`/api/admin/clients/${clientId}/portal-access`);
  await expectOk(response, "enablePortalAccess");
  const body = (await response.json()) as { code: string };
  return { code: body.code };
}

export async function createTestTask(api: APIRequestContext, clientId: string, overrides: Partial<{ title: string }> = {}) {
  const response = await api.post("/api/admin/client-tasks", {
    data: { client_id: clientId, title: overrides.title ?? `Tarefa E2E ${uniqueSuffix()}`, status: "pendente" },
  });
  await expectOk(response, "createTestTask");
  const body = (await response.json()) as { id: string };
  return { id: body.id };
}

/**
 * Semeia uma proposta de acao de IA direto via
 * app/api/admin/ai/proposals/test-seed/route.ts (so existe quando
 * E2E_TEST_MODE=1, setado por webserver-entrypoint.mjs) — usa a MESMA
 * persistProposedAction do orquestrador real. Necessario porque o ambiente
 * de E2E nunca tem provedor de IA configurado (ver comentario no
 * entrypoint), entao nao ha como uma tool call real acontecer via
 * /api/admin/ai/chat nesta suite.
 */
export async function seedAiProposal(
  api: APIRequestContext,
  params: { toolName: string; action: Record<string, unknown>; clientId?: string; submissionId?: string; asPatient?: boolean }
): Promise<{ proposalId: string; expiresAt: string; risk: string; requiresConfirmation: boolean }> {
  const response = await api.post("/api/admin/ai/proposals/test-seed", { data: params });
  await expectOk(response, "seedAiProposal");
  return response.json();
}

export async function startConsultationSession(api: APIRequestContext, clientId: string) {
  const response = await api.post(`/api/admin/clients/${clientId}/consultation`);
  await expectOk(response, "startConsultationSession");
  const body = (await response.json()) as { session: { id: string } };
  return body.session;
}
