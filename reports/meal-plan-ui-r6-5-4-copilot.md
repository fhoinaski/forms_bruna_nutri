# Meal Plan Composer UX/UI R6.5.4 — Clinical Copilot (R5)

## Entregue: os 2 gaps documentados como reais na R6.5.3

1. **Badge de prontidão (seções 56-57)**: os 3 estados reais do motor
   `computeMealPlanReadiness` (`NOT_READY`/`READY_WITH_REVIEW`/`READY`)
   agora sempre mostram uma badge com ícone+texto ("Faltam
   informações"/"Pronto com revisão"/"Pronto"). **Antes desta fase, o
   estado `READY` não mostrava absolutamente nada** — um
   `if (status === "READY") return null` silencioso. Essa é a
   correção mais significativa: a nutricionista agora tem confirmação
   visual positiva quando o prontuário está completo, não só avisos
   quando falta algo.
2. **Chips de resumo de revisão (seções 58-60)**: "N resolvido(s)",
   "N pra revisar", "N não encontrado(s)" — usando os contadores REAIS
   já computados (`totalNeedsReview`, `draft.nutrition.unresolvedCount`,
   e um novo `resolvedCount` derivado por subtração simples, sem
   nenhuma telemetria nova). Renderizados como `role="status"` no topo
   da etapa de revisão.

## Não implementado

- **Stepper visual** (seção 54-55) — o wizard continua mostrando
  "Etapa N de M · {rótulo}" como texto plano, não um stepper
  horizontal/vertical compacto. Não implementado — mudar essa área
  tocaria o texto usado indiretamente por vários testes de fluxo
  (`STEP_LABELS`), e o valor incremental de um stepper visual (mesma
  informação, apresentação diferente) não justificou o risco frente
  ao orçamento restante desta fase.
- **Breadcrumb de revisão aninhada redesenhado** (seção 61) — já
  existe como frase única ("Precisa de revisão — {refeição} →
  {opção/grupo}"), funcionalmente equivalente ao pedido, não
  redesenhado visualmente num componente de breadcrumb dedicado.
- **Changeset de plano anterior** (seção 64) — já mostra um resumo
  textual (`describeMealPlanChangeset`); não convertido pra chips
  visuais dedicados ("3 mantidas/2 alteradas/1 adicionada/0
  removidas") nesta fase.

## Prova (E2E dedicado)

`e2e/meal-plan-ui-r6-5-4-copilot.spec.ts` (4/4 PASS):
1. Paciente sem dados clínicos mostra a badge "Faltam informações"
   com um ícone real (não só texto).
2. Refeição totalmente resolvida (via fixture Copilot real) mostra
   "1 resolvido", sem chips de revisar/não encontrado.
3. Item COMBINATION não resolvido mostra "1 pra revisar" e a
   contagem correta de resolvidos (achado um bug real de cálculo
   nesta mesma verificação — ver abaixo).
4. Timestamp "Última alteração" no toolbar (ver `-audit.md`).

## Bug encontrado e corrigido durante a própria verificação desta fase

Minha primeira implementação de `resolvedCount` calculava
`total - needsReview - unresolved`, presumindo que itens em revisão
E itens não-resolvidos eram subconjuntos SEPARADOS de `.items`. O
teste dedicado (cenário COMBINATION com 1 item fixo resolvido + 1
item de grupo de escolha NOT_FOUND) revelou que itens `needsReview`
vivem numa lista SEPARADA, nunca dentro de `.items` — a fórmula
correta é `total - unresolved` (sem subtrair `needsReview` de novo,
já que esses itens nunca estavam contados em `total` pra começo de
conversa). Corrigido antes do commit, confirmado pelo mesmo teste.

## Gate

`MEAL_PLAN_UI_R6_5_4_COPILOT_STEPPER: FAIL` (não implementado).
`MEAL_PLAN_UI_R6_5_4_COPILOT_READINESS: PASS` (gap real fechado, os 3
estados agora visíveis com ícone+texto).
`MEAL_PLAN_UI_R6_5_4_COPILOT_REVIEW_CHIPS: PASS` (gap real fechado,
contadores reais, testado).
