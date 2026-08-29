# Meal Plan Composer UX/UI R6.5.2B — Auditoria

## Objetivo do pedido

Fechar os gaps deixados pela R6.5.2 (`MEAL_ACTION_MENU`, `FOOD_ROW`,
`INLINE_QUANTITY`, `COMBINATION_VISUAL`, `TOP_TOOLBAR` em FAIL;
`R5_COMPATIBILITY` NOT_TESTED; `R6_COMPATIBILITY` N-A) antes de
declarar `MEAL_PLAN_UI_R6_5_2_COMPLETE: sim` e liberar a R6.5.3.

## Auditoria (reaproveitando o mapeamento já feito na R6.5.2 + verificação direta nesta fase)

1. **Inline quantity/unit** (`MealItemsEditor.tsx`): já existe e já
   funciona sem modal — clicar em "Mais ações do alimento" → "Editar"
   troca a linha colapsada por uma linha de edição com
   `input[aria-label="Quantidade"]` e `select[aria-label="Medida"]`
   (ou `input[aria-label="Unidade"]` pra alimento sem porção
   canônica), tudo na MESMA linha. **Isso já satisfaz literalmente o
   requisito ("Quantity editable directly in row. No modal.") sem
   nenhuma mudança de código** — confirmado por teste dedicado (ver
   `-final-qa.md`).
2. **R3 "Trocas"**: já existe como botão na linha (`aria-label`
   contendo "trocas"), sem CTA duplicada.
3. **Top toolbar** (`MealPlanEditor.tsx`, barra sticky do plano): já
   mostra status (`Rascunho`/`Ativo` + versão), feedback de
   salvamento (`saveStateLabel`: "Alterações não salvas" / "Salvo
   agora" / "Salvo" / "Conflito de versão"), e **uma única ação
   primária** (`brand-btn-primary` só em "Revisar"/"Ativo") — todas as
   outras ações (Novo plano, Criar com IA, Imprimir, Editar, Salvar)
   são `brand-btn-secondary`. "Usar modelo" (R4) e "Criar com IA" (R5)
   já são os únicos pontos de entrada — nenhum sistema paralelo.
   **Também já satisfeito sem mudança de código.**
4. **COMBINATION**: `meal.items` (itens fixos) e `meal.choice_groups`
   (grupos de escolha, cada um com `title`/`min_selections`/
   `max_selections` editáveis e o texto "Escolha de X a Y item(ns)")
   já existiam. **Gap real**: nenhum rótulo distinguia visualmente os
   itens fixos do resto — corrigido nesta fase com um rótulo aditivo
   "Itens fixos" (só aparece quando há de fato grupo de escolha E
   itens base).
5. **`is_optional`**: já existe como campo real por item
   (`item.is_optional`, badge "opcional" já renderizado). A
   segmentação visual explícita "Opcionais" como seção separada (que
   exigiria filtrar/reordenar `meal.items` em duas passadas) **NÃO foi
   feita** — risco real de regressão no bloco de food rows (já
   responsável por 2 regressões reais em fases anteriores) frente ao
   badge "opcional" que já comunica a mesma informação por item.
6. **R5 compatibility**: nunca havia um teste dedicado provando que um
   rascunho flexível GERADO PELO COPILOT (não só criado manualmente)
   renderiza corretamente no Composer com os badges/divisor da R6.5.2.
   Corrigido nesta fase com 3 testes reais (SIMPLE/OPTIONS/COMBINATION)
   que passam pelo wizard de verdade (`Criar com IA` → fixture
   determinística → `Aplicar ao editor`).
7. **R6 compatibility**: nunca testado explicitamente no contexto da
   R6.5.2 (item de receita + badge de estrutura juntos). Confirmado
   real e disponível nesta linhagem (`POST /api/admin/recipes` +
   `food_source: "RECIPE"` funcionam) — teste dedicado adicionado.

## Seletores E2E preservados (contrato verificado antes de editar)

Nenhum aria-label/placeholder/heading indexado de OPTIONS/COMBINATION
foi tocado. O único DOM novo é um `<p>` de texto puro ("Itens fixos"),
inserido ANTES do `.map()` de `meal.items` já existente — não altera
ordem, índices, nem contagem de itens dentro do map.

## Decisão de escopo desta fase

Dado o histórico de 2 regressões reais nas 2 fases anteriores nesta
mesma área de código (R6.5.1: heading/grid removido; R6.5.2: coluna
central estreitada quebrando food rows), esta fase prioriza:
1. **Provar/testar o que já funciona** (inline quantity, R3, toolbar)
   em vez de reconstruir sem necessidade — value real, risco zero.
2. **Uma mudança visual mínima e aditiva** (rótulo "Itens fixos") em
   vez de um redesign completo de COMBINATION.
3. **Testes reais de compatibilidade R5/R6** — a lacuna mais concreta
   e de maior valor de fechamento (transforma NOT_TESTED/N-A em PASS
   com prova real).
4. **Não tocar** o food-row redesign, a consolidação do menu "⋯" do
   meal card, nem o redesign do toolbar — mantidos como gaps reais,
   documentados honestamente (ver tabela em `-final-qa.md`).
