import { d1Execute, d1Query } from "@/lib/d1/client";
import { type AIProvider } from "@/db/schema";
import { decryptNullableText, encryptNullableText } from "@/lib/security/encrypted-fields";

export type PreConsultationMode = "smart" | "traditional";

export interface AISettings {
  id: "default";
  provider: AIProvider;
  api_key: string | null;
  model: string;
  protocol_system_prompt: string | null;
  chat_system_prompt: string | null;
  patient_intake_mode: PreConsultationMode;
  updated_at: string;
}

export interface PublicAISettings {
  id: "default";
  provider: AIProvider;
  api_key: string | null;
  has_api_key: boolean;
  model: string;
  protocol_system_prompt: string | null;
  chat_system_prompt: string | null;
  patient_intake_mode: PreConsultationMode;
  updated_at: string;
}

export interface UpdateAISettingsInput {
  provider?: AIProvider;
  api_key?: string | null;
  model?: string;
  protocol_system_prompt?: string | null;
  chat_system_prompt?: string | null;
  patient_intake_mode?: PreConsultationMode;
}

export const DEFAULT_PROTOCOL_SYSTEM_PROMPT = `Você é um assistente de apoio a nutricionistas. Seu papel é gerar rascunhos de conduta nutricional para revisão profissional.

REGRAS ABSOLUTAS:
- Nunca gere diagnósticos fechados.
- Nunca use linguagem determinística como "diagnóstico certo", "prescrição automática" ou "tratamento garantido".
- Use sempre linguagem de sugestão: "pontos de atenção", "hipóteses de organização", "rascunho de conduta".
- Deixe claro que tudo precisa de revisão profissional.
- Não substitua a avaliação clínica real.
- Quando houver modelos ativos no banco, siga estritamente essa base para dieta, suplementação e substituições.
- Se o caso exigir algo fora da base, registre como ponto de revisão profissional em safetyNotes, sem prescrever.`;

export const DEFAULT_CHAT_SYSTEM_PROMPT = `Você é o assistente de uso do sistema, disponível no chat flutuante do dashboard. Seu único papel é ajudar a nutricionista a entender e usar as funcionalidades do sistema — nunca dar orientação clínica, nutricional ou sobre pacientes específicos.

REGRAS ABSOLUTAS:
- Responda apenas sobre como usar o sistema (onde encontrar uma tela, como cadastrar algo, como um recurso funciona).
- Nunca opine sobre conduta nutricional, diagnóstico, dieta ou qualquer decisão clínica — se perguntarem isso, explique que você só ajuda com o uso do sistema e que decisões clínicas são da nutricionista.
- Baseie suas respostas somente na base de conhecimento do sistema fornecida no contexto. Se a dúvida não estiver coberta por ela, diga que não tem certeza e sugira abrir a Central de Ajuda (/dashboard/ajuda) em vez de inventar uma tela ou passo que não existe.
- Seja direto e objetivo: poucas frases, passos numerados quando fizer sentido, e cite o nome exato da tela/menu quando possível.
- Nunca peça nem processe dados sensíveis do paciente nesta conversa.`;

export const DEFAULT_MEAL_SUGGESTION_SYSTEM_PROMPT = `Voce e um assistente de apoio para montar sugestoes alimentares revisaveis por nutricionista.

REGRAS ABSOLUTAS:
- A IA sugere, nunca prescreve. Toda sugestao precisa de revisao profissional antes do uso.
- Nunca invente alimento fora do que as ferramentas de busca retornarem.
- Nunca use dado individual de saude do paciente; use apenas contexto generico como target_group, nome da refeicao, categoria e pedido da nutricionista.
- Sempre prefira receita da biblioteca quando existir uma adequada ao objetivo.
- Se nao houver alimento ou receita adequado nas ferramentas, sinalize isso em notes em vez de forcar uma escolha.
- A resposta final deve conter somente JSON valido no formato pedido.
- Cada item precisa ter source "taco" ou "recipe" e id exatamente igual ao retornado pela ferramenta.`;

export function maskApiKey(apiKey: string | null): string | null {
  if (!apiKey) return null;
  if (apiKey.length <= 8) return "••••";
  return `${apiKey.slice(0, 3)}-...${apiKey.slice(-4)}`;
}

function decryptAISettings(settings: AISettings): AISettings {
  let apiKey: string | null = null;
  try {
    apiKey = decryptNullableText(settings.api_key);
  } catch (error) {
    // A api_key foi cifrada com uma chave de criptografia que não está mais
    // presente/igual no ambiente atual (env rotacionada ou banco restaurado de
    // outro ambiente). O AES-256-GCM falha com "Unsupported state or unable to
    // authenticate data" quando a tag não bate. Em vez de derrubar a rota com
    // um 502 ilegível, tratamos como "sem chave": a tela de IA carrega e o
    // admin consegue reconfigurar a chave normalmente.
    console.error(
      "[ai-settings] Não foi possível descriptografar a api_key armazenada — tratando como não configurada. Verifique CLINICAL_DATA_ENCRYPTION_KEY / MFA_ENCRYPTION_KEY / AUTH_SECRET no ambiente.",
      error instanceof Error ? error.message : error
    );
    apiKey = null;
  }
  return {
    ...settings,
    api_key: apiKey,
  };
}

/**
 * Cobre migrations antigas que podem não ter `patient_intake_mode` com os
 * valores novos ('smart'/'traditional'). Após 20260813_0038 a coluna sempre
 * existe; o fallback mantém a leitura resiliente a bancos ainda não migrados.
 */
function normalizeIntakeFields(settings: AISettings): AISettings {
  return {
    ...settings,
    patient_intake_mode: settings.patient_intake_mode ?? "traditional",
  };
}

export function isMaskedApiKey(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.includes("...");
}

async function ensureAISettingsRow() {
  await d1Execute(
    `INSERT INTO ai_settings (id, provider, api_key, model, protocol_system_prompt, chat_system_prompt, updated_at)
     VALUES ('default', 'openai', NULL, 'gpt-4o', NULL, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO NOTHING`
  );
}

export async function getAISettings(): Promise<AISettings> {
  await ensureAISettingsRow();
  const rows = await d1Query<AISettings>("SELECT * FROM ai_settings WHERE id = 'default' LIMIT 1");
  const settings = rows[0];
  if (!settings) {
    return {
      id: "default",
      provider: "openai",
      api_key: null,
      model: "gpt-4o",
      protocol_system_prompt: null,
      chat_system_prompt: null,
      patient_intake_mode: "traditional",
      updated_at: new Date().toISOString(),
    };
  }
  return normalizeIntakeFields(decryptAISettings(settings));
}

export async function getPublicAISettings(): Promise<PublicAISettings> {
  const settings = await getAISettings();
  return {
    id: settings.id,
    provider: settings.provider,
    api_key: maskApiKey(settings.api_key),
    has_api_key: Boolean(settings.api_key),
    model: settings.model,
    protocol_system_prompt: settings.protocol_system_prompt,
    chat_system_prompt: settings.chat_system_prompt,
    patient_intake_mode: settings.patient_intake_mode,
    updated_at: settings.updated_at,
  };
}

export async function updateAISettings(data: UpdateAISettingsInput): Promise<AISettings> {
  await ensureAISettingsRow();
  const updates: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.provider !== undefined) {
    updates.push(`provider = ?${idx++}`);
    params.push(data.provider);
  }
  if (data.model !== undefined) {
    updates.push(`model = ?${idx++}`);
    params.push(data.model);
  }
  if (data.protocol_system_prompt !== undefined) {
    updates.push(`protocol_system_prompt = ?${idx++}`);
    params.push(data.protocol_system_prompt);
  }
  if (data.chat_system_prompt !== undefined) {
    updates.push(`chat_system_prompt = ?${idx++}`);
    params.push(data.chat_system_prompt);
  }
  if (data.patient_intake_mode !== undefined) {
    updates.push(`patient_intake_mode = ?${idx++}`);
    params.push(data.patient_intake_mode);
  }
  if (data.api_key !== undefined && !isMaskedApiKey(data.api_key)) {
    updates.push(`api_key = ?${idx++}`);
    params.push(encryptNullableText(data.api_key?.trim() || null));
  }

  if (updates.length) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
    await d1Execute(`UPDATE ai_settings SET ${updates.join(", ")} WHERE id = 'default'`, params);
  }
  return getAISettings();
}
