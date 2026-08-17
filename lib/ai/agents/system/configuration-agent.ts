import { z } from "zod";
import { getPublicAISettings } from "@/lib/repositories/ai-settings";
import { truncateForToolOutput } from "@/lib/ai/privacy/sanitize-context";
import { PROPOSAL_DISCLAIMER } from "@/lib/ai/prompts/shared";

/**
 * FASE 5 (document/configuration/admin) — domínio "configuration".
 * Auditoria confirmou: a ÚNICA configuração real do sistema (fora de
 * templates, já cobertos no domínio "document") é `ai_settings`
 * (`lib/repositories/ai-settings.ts`) — não existem tabelas de clinic
 * settings/branding/notification prefs no projeto (não inventadas aqui).
 *
 * Leitura reaproveita `getPublicAISettings()`, que já mascara `api_key`
 * (nunca a chave em claro chega perto do LLM). Escrita cobre SÓ o único
 * campo que é claramente reversível e não-secreto/não-destrutivo:
 * `patient_safe_substitutions_enabled` (feature flag operacional). Nunca
 * expõe/altera provider, model, api_key ou os system prompts por aqui —
 * mudar isso pode quebrar o assistente inteiro ou trocar credencial, fora
 * do escopo de "write seguro e reversível" desta fase.
 */

// ── get_ai_settings (READ) ────────────────────────────────────────────────

export const GET_AI_SETTINGS_TOOL_NAME = "getAiSettings";
export const getAiSettingsInputSchema = z.object({}).strict();

export async function executeGetAiSettings() {
  const settings = await getPublicAISettings();
  return {
    provider: settings.provider,
    model: settings.model,
    hasApiKey: settings.has_api_key,
    apiKeyMasked: settings.api_key,
    patientIntakeMode: settings.patient_intake_mode,
    patientSafeSubstitutionsEnabled: settings.patient_safe_substitutions_enabled,
    // Prompts sao texto operacional longo (ate 20000 chars) — nunca segredo,
    // mas trunca defensivamente antes de virar resultado de tool (FASE 2A).
    chatSystemPromptConfigured: Boolean(settings.chat_system_prompt?.trim()),
    protocolSystemPromptConfigured: Boolean(settings.protocol_system_prompt?.trim()),
    chatSystemPromptPreview: settings.chat_system_prompt ? truncateForToolOutput(settings.chat_system_prompt, 300).text : null,
    updatedAt: settings.updated_at,
  };
}

// ── propose_update_safe_substitutions_setting (WRITE) ─────────────────────

export const PROPOSE_UPDATE_SAFE_SUBSTITUTIONS_SETTING_TOOL_NAME = "proposeUpdateSafeSubstitutionsSetting";
export const proposeUpdateSafeSubstitutionsSettingInputSchema = z.object({
  enabled: z.boolean(),
}).strict();
export type ProposeUpdateSafeSubstitutionsSettingInput = z.infer<typeof proposeUpdateSafeSubstitutionsSettingInputSchema>;

export type ProposeUpdateSafeSubstitutionsSettingOutput =
  | { error: string }
  | { previousEnabled: boolean; newEnabled: boolean };

export async function executeProposeUpdateSafeSubstitutionsSetting(
  input: ProposeUpdateSafeSubstitutionsSettingInput
): Promise<ProposeUpdateSafeSubstitutionsSettingOutput> {
  const settings = await getPublicAISettings();
  if (settings.patient_safe_substitutions_enabled === input.enabled) {
    return { error: `A configuração de substituições seguras já está ${input.enabled ? "ativada" : "desativada"}.` };
  }
  return { previousEnabled: settings.patient_safe_substitutions_enabled, newEnabled: input.enabled };
}

export const CONFIGURATION_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode consultar (e propor a mudanca de) configuracoes reais do sistema.
Como fazer isso:
- Para "qual modo de IA esta ativo", "qual provedor/modelo esta configurado", "as substituicoes seguras estao habilitadas", "qual o modo de pre-consulta (inteligente/tradicional)", use ${GET_AI_SETTINGS_TOOL_NAME}. Nunca revele a api_key — ela ja vem mascarada, e voce nunca deve tentar descobrir o valor completo.
- Para ativar/desativar as substituicoes seguras do portal do paciente, use ${PROPOSE_UPDATE_SAFE_SUBSTITUTIONS_SETTING_TOOL_NAME} — SEMPRE uma proposta, nunca aplicada sozinha. Se ja estiver no estado pedido, a ferramenta devolve "error" avisando disso — nao insista.
- Voce NAO pode alterar provider, modelo, api_key ou os system prompts do assistente por aqui — essas mudancas continuam exclusivas da tela Configuracoes > Inteligencia artificial, por serem mais sensiveis/estruturais (poderiam quebrar o proprio assistente ou trocar uma credencial).
- Nao existe "clinic settings"/branding/preferencias de notificacao configuraveis neste sistema hoje — se perguntarem, diga isso honestamente em vez de inventar uma tela.
- ${PROPOSAL_DISCLAIMER}
`.trim();
