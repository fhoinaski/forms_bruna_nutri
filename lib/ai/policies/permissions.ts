/**
 * Perfis de capacidade do assistente. Hoje so ADMIN_ASSISTANT esta
 * conectado a uma rota real (app/api/admin/ai/chat). PATIENT_ASSISTANT e um
 * scaffold para permitir, no futuro, IA no portal do paciente sem precisar
 * redesenhar a arquitetura — ver docs/AI-ARCHITECTURE.md.
 *
 * Cada tool do registry (lib/ai/tools/registry.ts) declara os perfis que
 * podem usa-la em `profiles`; nao existe lista separada duplicando isso
 * aqui — a fonte de verdade e o proprio registro da tool.
 */
export type AssistantCapabilityProfile = "ADMIN_ASSISTANT" | "PATIENT_ASSISTANT";

export function isProfileAllowed(
  toolProfiles: readonly AssistantCapabilityProfile[],
  profile: AssistantCapabilityProfile
): boolean {
  return toolProfiles.includes(profile);
}
