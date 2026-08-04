import { d1Execute, d1Query } from "@/lib/d1/client";
import { type AIProvider } from "@/db/schema";

export interface AISettings {
  id: "default";
  provider: AIProvider;
  api_key: string | null;
  model: string;
  protocol_system_prompt: string | null;
  chat_system_prompt: string | null;
  updated_at: string;
}

export interface PublicAISettings extends Omit<AISettings, "api_key"> {
  api_key: string | null;
  has_api_key: boolean;
}

export interface UpdateAISettingsInput {
  provider?: AIProvider;
  api_key?: string | null;
  model?: string;
  protocol_system_prompt?: string | null;
  chat_system_prompt?: string | null;
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

export const DEFAULT_CHAT_SYSTEM_PROMPT = "Você é um assistente administrativo e clínico de apoio à nutricionista. Responda com clareza, segurança e sem substituir avaliação profissional.";

export function maskApiKey(apiKey: string | null): string | null {
  if (!apiKey) return null;
  if (apiKey.length <= 8) return "••••";
  return `${apiKey.slice(0, 3)}-...${apiKey.slice(-4)}`;
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
      updated_at: new Date().toISOString(),
    };
  }
  return settings;
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
  if (data.api_key !== undefined && !isMaskedApiKey(data.api_key)) {
    updates.push(`api_key = ?${idx++}`);
    params.push(data.api_key?.trim() || null);
  }

  if (updates.length) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
    await d1Execute(`UPDATE ai_settings SET ${updates.join(", ")} WHERE id = 'default'`, params);
  }
  return getAISettings();
}
