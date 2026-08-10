import type { MealPlanPayload } from "@/lib/repositories/meal-plans";

export function buildActiveMealPlanContext(plan: MealPlanPayload | null): string {
  if (!plan) return "O cliente ainda nao tem um plano alimentar ativo cadastrado.";

  const meals = plan.meals
    .map((meal) => {
      const items = meal.items
        .map((item) => `${item.food}${item.quantity ? ` — ${item.quantity}${item.unit ?? ""}` : ""}`)
        .join("; ");
      return `- ${meal.name}${meal.suggested_time ? ` (${meal.suggested_time})` : ""}: ${items || "sem itens"}`;
    })
    .join("\n");

  return [
    "DADOS CALCULADOS/ESTRUTURADOS PELO SISTEMA PARA ANALISE DO PLANO (use como fatos; nao recalcular nem alterar):",
    `Plano alimentar ativo: "${plan.title}" (versao ${plan.version}).`,
    plan.notes ? `Observacoes do plano: ${plan.notes}` : "",
    "Refeicoes atuais:",
    meals || "(sem refeicoes cadastradas)",
  ].filter(Boolean).join("\n");
}

export const DIET_REVIEW_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode analisar o plano alimentar atual do cliente (fornecido no contexto acima) quando a nutricionista pedir uma revisao, apontar problemas ou reavaliar a conduta (ex.: "essa dieta ta com muito carboidrato no jantar", "reavalia esse plano", "da pra melhorar algo aqui?").
Como fazer isso:
- Separe fatos do sistema de sugestoes: quando citar algo do plano atual, trate como DADOS DO SISTEMA; quando interpretar ou sugerir, marque como SUGESTAO PARA REVISAO.
- Comente em texto normal (sem ferramenta) os pontos que valem atencao: distribuicao de macronutrientes ao longo do dia, repeticao excessiva de alimentos, porcoes que parecem incoerentes com o objetivo do cliente, ausencia de fontes importantes (fibra, proteina, etc.).
- Se a conversa levar a uma conduta ou ajuste concreto que valha registrar, use a ferramenta de prontuario para propor a atualizacao do campo "Plano de cuidado e conduta" ou "Metas antropometricas e clinicas" com o resumo da sua analise e da sugestao — sempre como PROPOSTA para revisao humana.
- Voce nao edita as refeicoes e alimentos do plano diretamente por aqui; para isso, a nutricionista deve usar o editor de plano alimentar (inclusive o botao "Sugerir com IA" de cada refeicao). Se for esse o pedido, oriente-a a usar aquele editor.
- Deixe claro que sua leitura e um apoio tecnico e a decisao final e da nutricionista.
`.trim();
