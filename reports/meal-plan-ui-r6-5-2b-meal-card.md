# Meal Plan Composer UX/UI R6.5.2B — Meal card

## O que foi entregue

Nada de novo no meal card em si nesta fase — o header compacto
(nome + horário + badge de estrutura), já entregue na R6.5.2,
permanece inalterado e continua verificado (teste
`meal-plan-ui-r6-5-2-layout.spec.ts` reexecutado, PASS).

## O que NÃO foi entregue (consolidação do menu "⋯")

`MEAL_ACTION_MENU` permanece **FAIL/NOT_IMPLEMENTED**. Os botões de
Duplicar (`aria-label="Duplicar {meal}"`) e reordenar (`aria-label="Mover
{meal} para cima/baixo"`) continuam como botões sempre visíveis,
SEPARADOS do menu "⋯" — exatamente como na R6.5.2.

**Motivo (reafirmado)**: pelo menos 6 specs de E2E
(`meal-plan-ux2.spec.ts` e outras) testam esses botões diretamente
por esse aria-label/posição. Consolidá-los no menu "⋯" — mesmo que
apenas movendo, sem remover a função — exigiria atualizar
deliberadamente cada um desses testes, e o food-row/meal-card já foi
responsável por 2 regressões reais nas 2 fases anteriores. Dado o
orçamento desta fase (fechar gaps de forma segura, não reabrir uma
área de alto risco sem necessidade clínica real), a decisão foi
NÃO tocar aqui. Fica como candidato real pra R6.5.3 ou uma fase
dedicada, com o entendimento explícito de que qualquer tentativa
futura precisa vir acompanhada da atualização coordenada dos testes
dependentes.

## Compatibilidade confirmada

O badge de estrutura e o divisor "OU" (R6.5.2) continuam corretos
mesmo para refeições GERADAS PELO COPILOT (não só criadas
manualmente) — confirmado pelos 3 novos testes de compatibilidade R5
(ver `-final-qa.md`).
