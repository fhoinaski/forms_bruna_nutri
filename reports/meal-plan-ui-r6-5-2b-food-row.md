# Meal Plan Composer UX/UI R6.5.2B — Food row

## `FOOD_ROW` (redesign visual): FAIL/NOT_IMPLEMENTED

Nenhum redesign visual do food row foi feito nesta fase. A linha
colapsada e a linha de edição continuam com a estrutura/classes
exatas de antes desta fase.

**Motivo**: esta é a área de código mais sensível do Composer — já
responsável por 2 regressões reais em fases anteriores (R6.5.1:
seletor de heading/grid removido; R6.5.2: coluna estreitada demais
clipando texto de badges dentro do food row). Um redesign visual real
exigiria tocar em múltiplas grades com larguras mínimas fixas em
pixels, dezenas de aria-labels indexados, e o fluxo de
colapsado↔edição — risco alto frente ao orçamento desta fase, cujo
objetivo era fechar gaps de forma segura, não reabrir a área de maior
risco do Composer sem necessidade.

## `INLINE_QUANTITY` / `INLINE_UNIT`: PASS (funcionalidade já existia, verificada nesta fase)

O requisito literal ("Quantity editable directly in row. No modal.")
**já era verdade antes desta fase** — não foi construído, foi
**confirmado com um teste real dedicado**:
`e2e/meal-plan-ui-r6-5-2b-closure.spec.ts`, teste "quantidade/unidade
inline (sem modal)":
1. Abre "Mais ações do alimento" → "Editar" na linha colapsada.
2. Confirma `page.getByRole("dialog")` tem contagem **0** (nenhum
   modal foi aberto).
3. Localiza `input[aria-label="Quantidade"]:visible` na MESMA linha
   e altera o valor.
4. Confirma a sidebar de nutrição ("Plano do dia") reflete o novo
   valor (prova que a Live Nutrition atualiza sem segundo
   calculador — o mesmo Nutrition Engine de sempre).

**PASS** — sem nenhuma mudança de código, apenas prova.

## `R3_SUGGESTIONS`: PASS (verificado)

O botão/entrada "Trocas" (R3) continua acessível na linha, sem CTA
duplicada — confirmado no mesmo teste (`trocasButtons.count() > 0`).

## Portion safety / validação numérica

Nenhuma conversão nova foi inventada; nenhuma validação numérica
existente foi tocada — o campo de quantidade continua usando o mesmo
input controlado de sempre.
