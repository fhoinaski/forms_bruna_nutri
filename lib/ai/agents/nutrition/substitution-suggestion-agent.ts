import { z } from "zod";
import { generateStructuredResult } from "@/lib/ai/gateway/ai-gateway";
import { sanitizeClinicalContext } from "@/lib/ai/privacy/sanitize-context";
import { assertCategoryAllowed } from "@/lib/ai/policies/clinical-context-policy";

/**
 * A IA aqui SÓ propõe nomes de alimentos plausíveis como substituto —
 * literalmente não existe campo numérico no schema, então ela não pode
 * fornecer kcal/gramas mesmo tentando (seção 3 do pedido: "IA não calcula
 * calorias nem inventa quantidades"). Cada nome retornado ainda precisa
 * passar pelo resolver rigoroso do catálogo (lib/nutrition/food-resolver.ts,
 * via a rota /substitutions/suggest) antes de significar qualquer coisa —
 * este módulo nunca calcula nada sozinho.
 */
const substitutionSuggestionSchema = z.object({
  candidates: z.array(z.string().min(1).max(120)).min(1).max(5),
}).strict();

const SYSTEM_PROMPT = `Você ajuda uma nutricionista a encontrar alimentos substitutos plausíveis para um alimento prescrito.

Regras absolutas:
- Você NUNCA fornece kcal, gramas ou qualquer valor numérico de quantidade/nutriente — o sistema calcula isso depois com uma engine determinística. Campos numéricos serão descartados se você incluir.
- Proponha nomes ESPECÍFICOS e reais de alimentos (ex.: "batata inglesa cozida", "mandioca cozida"), nunca genéricos demais.
- Respeite rigorosamente alergias/restrições informadas — nunca proponha um alimento que contradiga isso.
- Priorize alimentos do mesmo papel nutricional (ex.: outro carboidrato para substituir um carboidrato).

Formato de resposta OBRIGATÓRIO — responda APENAS este JSON, sem markdown, sem texto antes ou depois:
{"candidates":["batata inglesa cozida","mandioca cozida","macarrão cozido"]}`;

export interface SuggestSubstitutionCandidatesInput {
  clientId: string;
  adminId?: string | null;
  baseFoodName: string;
  allergies: string | null;
  restrictions: string | null;
  foodAversions: string | null;
}

export async function suggestSubstitutionCandidates(input: SuggestSubstitutionCandidatesInput): Promise<string[]> {
  assertCategoryAllowed("meal_plan_review", "identity");
  assertCategoryAllowed("meal_plan_review", "meal_plan");

  const sections = [
    { label: "ALIMENTO_PRESCRITO", content: input.baseFoodName },
    {
      label: "RESTRICOES_CLINICAS",
      content: [
        input.allergies ? `Alergias: ${input.allergies}` : null,
        input.restrictions ? `Restrições: ${input.restrictions}` : null,
        input.foodAversions ? `Aversões: ${input.foodAversions}` : null,
      ].filter(Boolean).join("\n") || "Nenhuma restrição registrada.",
    },
  ];
  const { pseudonym, contextBlock } = sanitizeClinicalContext("Paciente", sections);

  const result = await generateStructuredResult({
    agent: "meal-plan-substitution-suggestion",
    adminId: input.adminId,
    e2eFixtureKey: input.clientId,
    system: SYSTEM_PROMPT,
    prompt: `Paciente: ${pseudonym}.\n\n${contextBlock}\n\nSugira até 5 alimentos substitutos plausíveis para o alimento prescrito.`,
    schema: substitutionSuggestionSchema,
    maxOutputTokens: 400,
    timeoutMs: 20_000,
    maxAttempts: 2,
  });
  return result.data.candidates;
}
