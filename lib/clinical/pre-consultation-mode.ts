import {
  getAISettings,
  type AISettings,
  type PreConsultationMode,
} from "@/lib/repositories/ai-settings";
import { isDeterministicTestProvider } from "@/lib/ai/agents/patient/intake/intake-agent";

export type { PreConsultationMode };

/**
 * FONTE ÚNICA DE VERDADE do modo público da pré-consulta (§8 do produto).
 *
 * A regra é exatamente:
 *   configuredMode = 'traditional'                        → 'traditional'
 *   configuredMode = 'smart'     && IA disponível         → 'smart'
 *   configuredMode = 'smart'     && IA indisponível       → 'traditional'
 *
 * Nenhum componente decide isso por conta própria; `/formulario`, os
 * endpoints de disponibilidade/sessão e o dashboard chamam esta função.
 */

export interface PreConsultationModeResolution {
  /** Escolha da nutricionista (persistida em ai_settings.patient_intake_mode). */
  configuredMode: PreConsultationMode;
  /** O que realmente será usado neste momento. */
  effectiveMode: PreConsultationMode;
  /** Provedor + modelo + chave configurados (ou executor determinístico de E2E). */
  aiAvailable: boolean;
  reason?: "ai_unavailable";
}

/** IA considerada configurada apenas quando provider, modelo e chave existem. */
export function isAiConfigured(
  settings: Pick<AISettings, "provider" | "model" | "api_key">
): boolean {
  return Boolean(settings.provider) && Boolean(settings.model) && Boolean(settings.api_key);
}

/**
 * Disponibilidade real de IA. No ambiente de teste determinístico (E2E), a
 * disponibilidade é resolvida sem exigir chave real — sem backdoor público.
 */
export function isAiAvailable(
  settings: Pick<AISettings, "provider" | "model" | "api_key">
): boolean {
  if (isDeterministicTestProvider()) return true;
  return isAiConfigured(settings);
}

/** Regra pura configuredMode → effectiveMode (testável sem I/O). */
export function resolvePreConsultationMode(
  configuredMode: PreConsultationMode,
  aiAvailable: boolean
): PreConsultationModeResolution {
  const effectiveMode: PreConsultationMode =
    configuredMode === "smart" && aiAvailable ? "smart" : "traditional";
  return {
    configuredMode,
    effectiveMode,
    aiAvailable,
    reason: configuredMode === "smart" && !aiAvailable ? "ai_unavailable" : undefined,
  };
}

/**
 * Resolve o modo público lendo a configuração persistida. `configuredModeOverride`
 * permite injetar o modo escolhido por request (usado apenas no E2E, via
 * `readE2EIntakeModeOverride`) sem mutar o estado global — essencial para que
 * testes paralelos não corrompam a decisão um do outro.
 */
export async function resolvePublicPreConsultationMode(
  configuredModeOverride?: PreConsultationMode
): Promise<PreConsultationModeResolution> {
  const settings = await getAISettings();
  return resolvePreConsultationMode(
    configuredModeOverride ?? settings.patient_intake_mode,
    isAiAvailable(settings)
  );
}

/**
 * Lê o override de modo a partir do header `x-e2e-intake-mode`. Só tem efeito
 * sob `E2E_TEST_MODE=1` (sem backdoor em produção) e aceita apenas os valores
 * do enum (`smart`/`traditional`) — qualquer outro valor é ignorado.
 */
export function readE2EIntakeModeOverride(
  headers?: { get(name: string): string | null }
): PreConsultationMode | undefined {
  if (process.env.E2E_TEST_MODE !== "1") return undefined;
  const value = headers?.get("x-e2e-intake-mode");
  return value === "smart" || value === "traditional" ? value : undefined;
}
