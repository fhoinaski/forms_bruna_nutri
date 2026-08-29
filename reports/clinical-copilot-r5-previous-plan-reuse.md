# Clinical Copilot R5 — Reuso do Plano Anterior (Changeset)

## Fluxo (seções 23-31)

No wizard "Criar com IA", quando o paciente já tem pelo menos um plano com
refeições, uma nova etapa inicial ("Novo ou plano anterior") oferece
`[ Criar novo ]` / `[ Usar plano anterior como base ]`. Escolhendo a
segunda opção:

1. A nutricionista escolhe QUAIS refeições o Copilot deve (re)propor —
   reaproveita a mesma grade de seleção por `mealKey` já existente no
   wizard (seção 4 do pedido de arquitetura: nunca um segundo mecanismo de
   seleção).
2. Refeições com QUALQUER item bloqueado (`quantity_locked` ou
   `substitutions_locked` — mecanismo já existente do R2/R4) aparecem
   marcadas com 🔒, desabilitadas — nunca selecionáveis (seção 27).
3. A geração roda pela MESMA `generateMealPlanDraft` já existente — nenhuma
   segunda lógica de geração. As refeições NÃO selecionadas entram como
   `otherMealsContext` (contexto de variedade, mesmo parâmetro que
   `regenerateMealInDraft` já usava internamente pra refeição única — agora
   também exposto na rota principal).
4. Antes de aplicar, um changeset é calculado e mostrado: **N mantida(s),
   N alterada(s), N adicionada(s), N removida(s)** — nunca aplica sem
   mostrar o resumo (seção 29).
5. Ao confirmar, o plano de ORIGEM é clonado como um NOVO draft
   (reaproveitando a mesma disciplina de `duplicateCurrentPlan`, R4 —
   nunca edita o original) e o resultado final é a MESCLA: refeições
   mantidas ficam exatamente como estavam, as regeneradas substituem só
   as casadas, e as sem correspondência entram como adição no final.

## Casamento por nome (nunca por posição)

`matchMealKeyToExisting` (`lib/ai/agents/nutrition/meal-plan-changeset.ts`)
compara o nome real da refeição existente contra o rótulo humano do slot
canônico (`MEAL_KEY_LABELS`) — nunca por índice/posição (planos reais têm
refeições em qualquer ordem e com nomes livres, ex.: um plano pode ter
"Almoço" na posição 2). Sem correspondência clara, a refeição do Copilot
vira ADD, nunca um palpite arriscado de MODIFY.

## Sem reescrita destrutiva (seção 28)

`remove` no changeset é sempre vazio nesta fase — documentado
explicitamente no código e aqui: o Copilot nunca decide remover uma
refeição existente sozinho. Remover continua sendo uma ação manual da
nutricionista no Composer, depois de aplicar a proposta.

## Nunca confia em snapshot antigo (seção 48, princípio central)

O plano clonado como base do novo draft passa pela mesma
`sanitizeMealForPlanClone` (R4) — nenhum `nutrition_snapshot`/
`food_name_snapshot` sobrevive à clonagem, mesmo antes do primeiro save; a
Nutrition Engine recalcula tudo a partir da identidade canônica atual
(`food_source`/`food_ref_id`), nunca de um valor congelado do plano
original.

## Testes

- `tests/meal-plan-changeset.test.ts` (13 casos): locks, casamento por
  nome, comparação por conteúdo (nunca por referência), KEEP/MODIFY/ADD,
  `remove` sempre vazio, merge sem reordenar/apagar o não tocado.
- `e2e/clinical-copilot-r5-readiness-changeset.spec.ts`: fluxo completo
  ponta a ponta (regenerar só o Almoço via fixture determinística, diff
  correto exibido, plano original intocado no banco, novo draft criado com
  a mescla correta) + refeição bloqueada nunca selecionável.
