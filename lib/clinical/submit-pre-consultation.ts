import { LegacyFormSchema } from "@/lib/validators/submission";
import {
  createSubmission,
  type SubmissionSource,
} from "@/lib/repositories/submissions";
import { recordConsent } from "@/lib/repositories/privacy";
import { ensureOpportunityForSubmission } from "@/lib/repositories/lead-opportunities";
import { deterministicUuidV5 } from "@/lib/utils/deterministic-uuid";

/**
 * Serviço canônico de persistência da pré-consulta.
 *
 * AMBOS os fluxos — formulário tradicional e entrevista guiada por IA —
 * terminam aqui. Não existe SQL ou regra duplicada em route handler: o
 * contrato clínico é `LegacyFormSchema`; a persistência e os efeitos
 * colaterais (consentimento + oportunidade) são centralizados.
 */

export interface PreConsultationSubmissionResult {
  id: string;
}

export async function submitPreConsultation(
  payload: unknown,
  options: {
    ipHash: string;
    userAgentHash: string;
    source?: SubmissionSource;
    /** ID determinístico opcional (idempotência do fluxo de intake). */
    submissionId?: string;
  }
): Promise<PreConsultationSubmissionResult> {
  const result = LegacyFormSchema.safeParse(payload);
  if (!result.success) {
    throw new SubmissionValidationError(result.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = result.data;
  const {
    privacyAccepted: _,
    companyWebsite: __,
    ...rest
  } = data;

  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null && value !== "") {
      answers[key] = String(value);
    }
  }

  const id = await createSubmission({
    id: options.submissionId,
    patient_name: data.nome,
    patient_email: data.email || null,
    patient_phone: data.whatsapp || null,
    child_name: data.child_name || null,
    child_age: data.child_age || null,
    form_type: "pre_consulta",
    source: options.source ?? null,
    answers,
  });

  await recordConsent({
    submissionId: id,
    ipHash: options.ipHash,
    userAgentHash: options.userAgentHash,
    // Consentimento determinístico quando o id de submissão é determinístico
    // (fluxo de intake) — torna o efeito colateral idempotente também.
    id: options.submissionId ? deterministicUuidV5(`${id}/consent`) : undefined,
  });
  await ensureOpportunityForSubmission(id);

  // Pré-análise automática (§20): dispara de forma NÃO bloqueante após a
  // submissão confirmada. Reusa `submission_pre_analyses` existente; só roda
  // quando a IA está configurada e falha silenciosamente sem afetar o envio.
  void import("@/lib/ai/agents/clinical/pre-analysis-generator")
    .then(({ maybeGeneratePreAnalysis }) => maybeGeneratePreAnalysis(id))
    .catch(() => null);

  return { id };
}

export class SubmissionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubmissionValidationError";
  }
}