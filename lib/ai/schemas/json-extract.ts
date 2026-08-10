/**
 * Extrai um objeto JSON de uma resposta de texto de LLM, que pode vir cru,
 * dentro de um code fence markdown (```json ... ```) ou com texto ao redor.
 * Centraliza uma logica que antes estava duplicada em lib/ai/protocol-agent.ts
 * e lib/validators/ai-meal-suggestion.ts.
 */
export function extractJsonFromText(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1];
  const braceMatch = text.match(/(\{[\s\S]*\})/);
  return braceMatch ? braceMatch[1] : text;
}

/**
 * Faz o parse de JSON extraido de texto de LLM sem lancar excecao "crua" —
 * devolve null em caso de falha para o chamador decidir a estrategia de
 * fallback/erro, em vez de deixar um SyntaxError sem contexto propagar.
 */
export function tryParseJsonFromText(text: string): unknown | null {
  try {
    return JSON.parse(extractJsonFromText(text));
  } catch {
    return null;
  }
}
