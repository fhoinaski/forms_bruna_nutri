import type { MealPlanPayload } from "@/lib/repositories/meal-plans";
import { wrapUntrustedData } from "@/lib/ai/privacy/sanitize-context";

export function buildActiveMealPlanContext(plan: MealPlanPayload | null): string {
  if (!plan) return "O cliente ainda nao tem um plano alimentar ativo cadastrado.";

  const meals = plan.meals
    .map((meal) => {
      const items = meal.items
        .map((item) => `  - [item:${item.id}] ${item.food}${item.quantity ? ` — ${item.quantity}${item.unit ?? ""}` : ""}`)
        .join("\n");
      return `- [meal:${meal.id}] ${meal.name}${meal.suggested_time ? ` (${meal.suggested_time})` : ""}:\n${items || "  (sem itens)"}`;
    })
    .join("\n");

  return [
    "DADOS CALCULADOS/ESTRUTURADOS PELO SISTEMA PARA ANALISE E EVENTUAL ALTERACAO DO PLANO (use como fatos; nao recalcular; os ids entre colchetes sao os reais do banco, use-os exatamente assim se for propor uma alteracao):",
    `Plano alimentar ativo: "${plan.title}" (id: ${plan.id}, versao: ${plan.version}).`,
    // plan.notes e texto livre (pode ter sido colado a partir de uma
    // resposta do paciente/formulario) — nunca interpolado cru no prompt,
    // sempre envolvido como DADO nao confiavel (secao 22 do pedido).
    plan.notes ? wrapUntrustedData("OBSERVACOES_DO_PLANO", plan.notes) : "",
    "Refeicoes atuais:",
    meals || "(sem refeicoes cadastradas)",
  ].filter(Boolean).join("\n");
}

export const DIET_REVIEW_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode analisar o plano alimentar atual do cliente (fornecido no contexto acima) quando a nutricionista pedir uma revisao, apontar problemas ou reavaliar a conduta (ex.: "essa dieta ta com muito carboidrato no jantar", "reavalia esse plano", "da pra melhorar algo aqui?").
Como fazer isso:
- Separe fatos do sistema de sugestoes: quando citar algo do plano atual, trate como DADOS DO SISTEMA; quando interpretar ou sugerir, marque como SUGESTAO PARA REVISAO.
- Comente em texto normal (sem ferramenta) os pontos que valem atencao: distribuicao de macronutrientes ao longo do dia, repeticao excessiva de alimentos, porcoes que parecem incoerentes com o objetivo do cliente, ausencia de fontes importantes (fibra, proteina, etc.).
- Se a nutricionista pedir uma alteracao concreta no plano (trocar/adicionar/remover alimento ou refeicao, mudar quantidade/horario), use a ferramenta de alteracao de plano alimentar descrita a seguir — nao vire mais texto solto do prontuario. Se for so analise/opiniao, sem pedido de mudanca, NAO chame nenhuma ferramenta de alteracao.
- Se a conversa levar a uma conduta clinica mais ampla (nao uma mudanca de refeicao/item especifica) que valha registrar, use a ferramenta de prontuario para propor a atualizacao do campo "Plano de cuidado e conduta" ou "Metas antropometricas e clinicas".
- Deixe claro que sua leitura e um apoio tecnico e a decisao final e da nutricionista.
`.trim();
