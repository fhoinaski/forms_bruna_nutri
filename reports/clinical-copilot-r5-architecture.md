# Clinical Copilot R5 — Arquitetura

## Objetivo

Integrar o Clinical Copilot (assistente de IA de geração de pré-planos) ao
Meal Plan Composer profissional, sempre respeitando o princípio central:
**a IA propõe estrutura, nunca é autoridade sobre nutrição/identidade
canônica**. Fluxo: pré-consulta + prontuário + antropometria + preferências
+ restrições + objetivos + plano anterior → Clinical Copilot → structured
draft → canonical food resolution → Nutrition Engine → Composer → revisão
humana → save explícito → publish explícito. Nunca `IA → publish direto`.

## Branch e base

- Branch: `feat/clinical-copilot-r5`
- Base: `feat/meal-plan-reuse-r4` @ `7d6657d7d44f00a6ceeca8610dbc51c068910f22` (R4, CI verde, fechado)

## Auditoria feita ANTES de qualquer código (seção 1/2 do pedido)

Um agente de pesquisa dedicado auditou o estado real do Clinical Copilot
nesta branch (não na branch/worktree onde a fase "R1.2.6" foi tentada
anteriormente). Achados centrais:

1. **R1.2.6 nunca foi mesclada nesta linhagem.** A fase "Clinical Copilot
   R1.2.6" (conforme resumo desta sessão) rodou num worktree DIFERENTE
   (`forms_bruna_nutri`), terminou incompleta (sem markers finais impressos,
   sem commit) quando o usuário pivotou pra Composer R2 — e o Composer
   R2/R3/R4 foi todo construído a partir de `codex/meal-flex-r1`, não a
   partir daquele trabalho. Concretamente: `lib/ai/gateway/e2e-stage-timings.ts`
   e o gate `generationReadiness` mencionados nessa fase **não existem**
   neste worktree. Isso não é dívida escondida — é documentado aqui
   explicitamente, conforme pedido ("não esconder dívida anterior"): a R5
   reconstrói esses dois conceitos do zero, na linhagem correta, em vez de
   depender de um trabalho que nunca chegou a ser fechado/mesclado.
2. **O pipeline de IA já é maduro e disciplinado.** `lib/ai/agents/nutrition/
   meal-plan-draft-agent.ts` já implementa integralmente o princípio "IA
   PROPÕE, ENGINE CALCULA": o schema do LLM (`draftFoodItemSchema`) só tem
   `query/quantity/unit` — nenhum campo de kcal/macro/id canônico existe
   pra IA preencher; tudo isso já é garantido por `.strict()` do Zod, testado
   extensivamente em `tests/ai-meal-plan-draft-agent.test.ts` (kcal
   descartado, `recipeId` inventado descartado, alimento ambíguo nunca
   escolhido sozinho, conflito clínico nunca entra silenciosamente no
   cálculo).
3. **Gaps reais confirmados**: nenhum contrato de prontidão (readiness)
   explícito; nenhum suporte a OPTIONS/COMBINATION na geração por IA (só
   SIMPLE); nenhum modo "usar plano anterior como base"/changeset; locks
   persistidos (`quantity_locked`/`substitutions_locked`) nunca chegam ao
   agente de IA; progresso da geração é um spinner genérico, sem estágios.

## Decisão de escopo (aprovada explicitamente pelo usuário)

Dado o tamanho do pedido completo — que incluía suporte a OPTIONS/
COMBINATION na geração por IA com revisão aninhada — e o risco real de
desestabilizar um wizard já maduro e amplamente testado
(`AiMealPlanWizard.tsx`, 1400+ linhas, 5 specs E2E dedicadas + suíte de
regressão), foi apresentada e aprovada a seguinte decisão: **esta fase
entrega um R5 com escopo definido, deixando OPTIONS/COMBINATION na geração
por IA (com revisão aninhada) para uma fase de fast-follow (R5.1)**.
Consequência honesta: `CLINICAL_COPILOT_R5_COMPLETE` não pode ser `sim` sob
a regra de conclusão original (que exige OPTIONS/COMBINATION PASS) — os
marcadores finais refletem isso sem ambiguidade.

## O que foi construído nesta fase

1. **Contrato de prontidão** (`lib/ai/agents/nutrition/meal-plan-readiness.ts`)
   — `NOT_READY | READY_WITH_REVIEW | READY`, puro, reaproveitado tanto no
   cliente (wizard) quanto potencialmente no servidor.
2. **Modo "Usar plano anterior como base"** (`lib/ai/agents/nutrition/
   meal-plan-changeset.ts`) — casamento por nome, respeito a itens/refeições
   bloqueados, changeset KEEP/MODIFY/ADD/REMOVE (REMOVE documentadamente
   sempre vazio nesta fase — nunca reescrita destrutiva), merge sem
   reordenar/apagar o que não foi tocado.
3. **Novo ponto de entrada "Criar com IA"** no `MealPlanEditor.tsx` quando
   já existe um plano — gap real descoberto durante a implementação: o
   botão só existia no estado vazio (sem plano nenhum), o que tornava o
   modo "plano anterior" inalcançável na prática.
4. **Idempotência/stale-request safety** na geração do wizard (contador de
   geração + guarda contra clique duplo).
5. **`otherMealsContext`** exposto na rota principal de geração (antes só
   disponível internamente por `regenerateMealInDraft`) — permite ao modo
   "plano anterior" dar contexto de variedade ao Copilot sem duplicar lógica.

## Não implementado nesta fase (documentado, não escondido)

- OPTIONS/COMBINATION na geração por IA (schema/prompt/assembly ainda só
  emitem SIMPLE) — ver seção "Escopo" acima.
- Progresso da geração em múltiplos estágios visíveis (context/generating/
  resolving/hydrating) — ver `reports/clinical-copilot-r5-performance.md`
  pra justificativa técnica (os sub-estágios não são observáveis do cliente
  sem uma reformulação em streaming/múltiplas chamadas, fora do escopo desta
  fase).
