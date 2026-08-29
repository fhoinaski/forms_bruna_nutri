# Clinical Copilot R5 — Structured Output

## Estado confirmado (não alterado nesta fase)

O contrato estruturado do LLM (`draftFoodItemSchema`/`draftMealLlmSchema`/
`mealPlanDraftLlmSchema` em `lib/ai/agents/nutrition/meal-plan-draft-agent.ts`)
já era, antes desta fase, exatamente o que a seção 9/10 do pedido pede:

- Zod `.strict()` em todo nível — qualquer campo extra (kcal, macros,
  `canonicalFoodId`, `food_ref_id` inventado) é descartado no parse, nunca
  aceito silenciosamente.
- `query/quantity/unit` é tudo que a IA pode fornecer por item — nenhum
  campo de identidade canônica ou nutriente.
- `recipeId` só é aceito se bater com um id REAL da lista de receitas
  fornecida no prompt (revalidado no resolver, nunca confia no zod sozinho).

Isso já estava integralmente testado (`tests/ai-meal-plan-draft-agent.test.ts`)
antes desta fase — replicado aqui com dois testes NOVOS e explícitos (seção
15/16/51/52/69/70 do pedido, `tests/clinical-copilot-r5-authority.test.ts`):
um `canonicalFoodId`/`food_ref_id` inventado no payload é rejeitado pelo
schema estrito (a identidade final vem só do resolver real), e um alimento
que a IA propõe mas não existe no catálogo vira `NOT_FOUND` — nunca um
alimento fabricado.

## Contrato de nível superior (`ClinicalMealPlanDraft`)

O pedido sugeria um contrato `{summary, rationale?, meals[], unresolved_items[],
review_items[]}`. Adaptado ao que já existe: `MealPlanDraftResult` já expõe
`meals: DraftMeal[]` e `warnings: DraftWarning[]`; cada `DraftMeal` já
carrega seu próprio `needsReview: DraftMealNeedsReview[]` (o equivalente a
`review_items`/`unresolved_items`, já por refeição — mais granular que um
único array de nível superior). Não foi criado um novo campo agregado de
nível superior nesta fase: a UI (wizard) já soma esses arrays por refeição
pra exibir contadores (ver seção "Review Queue" abaixo) — introduzir um
segundo lugar pra manter a mesma contagem seria duplicar estado, não
simplificar.

## SIMPLE (seção 11)

Suportado integralmente (já existia, testado).

## OPTIONS/COMBINATION (seções 12-14) — NÃO implementado nesta fase

Confirmado pela auditoria: a geração por IA hoje só emite refeições SIMPLE
— nenhum campo `meal_structure`/`options`/`choice_groups` existe em
`draftMealLlmSchema`/`DraftMeal`. Estender o LLM pra propor OPTIONS
(refeições alternativas completas, nunca somadas) e COMBINATION (itens
fixos + grupos de escolha + itens opcionais), com revisão aninhada
(`REVIEW_REQUIRED` dentro de uma opção ou grupo de escolha sendo
encontrado e exibido corretamente) é uma mudança substancial de prompt,
schema de assembly e UI de revisão — decisão explícita, aprovada pelo
usuário, de deixar para uma fase R5.1 dedicada, para não arriscar
desestabilizar o pipeline SIMPLE maduro e amplamente testado nesta mesma
passada. Documentado aqui, não escondido.

**Importante (seção 14, já respeitado por construção)**: mesmo quando
OPTIONS/COMBINATION da IA existir (R5.1), a distinção entre
"OPTIONS/COMBINATION no nível da refeição" (estrutura da refeição em si) e
"grupos de troca no nível do item" (domínio do R3, `exchange_groups`) nunca
deve ser confundida — nada nesta fase ou na próxima toca o domínio de
trocas por item.

## Nutrition Engine como autoridade única (seção 21)

Reafirmado, não alterado: `assembleDraft` nunca usa um valor nutricional
vindo da IA — todo cálculo de nutrição do draft passa por
`lib/nutrition/draft-nutrition.ts#calculateDraftNutrition`, que por sua vez
usa a mesma `calculatePlanNutrients`/`calculateItemNutrients` do resto do
app. Testado em `tests/ai-meal-plan-draft-agent.test.ts` ("paridade: rascunho
da IA -> engine central == editor == impressão").

## Metas (seção 22)

Já reaproveitado: o wizard usa as metas nutricionais já existentes do plano
(`target_energy_kcal` etc.) — nenhum segundo sistema de metas foi criado
nesta fase.
