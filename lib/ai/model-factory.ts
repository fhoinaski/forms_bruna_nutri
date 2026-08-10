import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import type { AISettings } from "@/lib/repositories/ai-settings";

/**
 * Instancia o modelo de linguagem configurado em Configuracoes > IA,
 * conforme o provedor escolhido. Usado por todos os agentes de IA do
 * sistema (protocolos, sugestao de refeicao, chat) para nao duplicar essa
 * logica em cada arquivo.
 */
export function createConfiguredModel(settings: AISettings): LanguageModel {
  if (!settings.api_key) {
    throw new Error("API Key de IA nao configurada. Acesse Dashboard > Configuracoes > Inteligencia artificial e salve uma chave valida.");
  }

  const apiKey = settings.api_key;

  switch (settings.provider) {
    case "openai":
      return createOpenAI({ apiKey })(settings.model);
    case "anthropic":
      return createAnthropic({ apiKey })(settings.model);
    case "google":
      return createGoogle({ apiKey })(settings.model);
    case "deepseek":
      return createDeepSeek({ apiKey })(settings.model);
    case "xai":
      return createXai({ apiKey })(settings.model);
    case "groq":
      return createGroq({ apiKey })(settings.model);
    case "mistral":
      return createMistral({ apiKey })(settings.model);
    default:
      throw new Error(`Provedor de IA nao suportado: ${settings.provider}`);
  }
}
