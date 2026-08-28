# Meal Plan Composer UX/UI R6.5 — Fechamento Geral (Fases 1 → 4)

## Histórico de fases

| Fase | PR | Commit | Entregue |
| --- | --- | --- | --- |
| R6.5.1 | #10 | 46c91bd | Nutrition Sidebar: energia/meta, barras de progresso por macro, missing seguro ("—") |
| R6.5.2 | #11 | 6d8dec8 | Layout 3 colunas (só 2xl+), navegação de refeições, meal ativo, badge de estrutura, divisor "OU" |
| R6.5.2B | #12 | 1cc9dff | Rótulo COMBINATION, compatibilidade R5 (SIMPLE/OPTIONS/COMBINATION via Copilot real) e R6 (receita), toolbar/inline quantity confirmados |
| R6.5.2C | #13 | 35aefc3 | Menu de ações da refeição consolidado (⋯, acessível), food row com hover-reveal |
| R6.5.3 | #14 | 0624ef8 | Hook de teclado compartilhado; Escape/Tab-trap retrofitado no Copilot e no modal de receita (gap real fechado); bug do "x" corrigido; backdrop normalizado |
| R6.5.4 | (esta) | — | Timestamp "Última alteração" no toolbar; badge de prontidão do Copilot (os 3 estados, antes READY não mostrava nada); chips de resumo de revisão (contadores reais) |

Todas as 6 fases fecharam com CI verde na SHA exata e zero regressão
introduzida (confirmado por reexecução ampla a cada fechamento).

## Matriz de requisitos (seção 134 do pedido R6.5.3, seção 119 do pedido R6.5.4)

| Requisito (origem) | Fase | Testado | Status |
| --- | --- | --- | --- |
| Header de energia/meta | R6.5.1 | E2E | PASS |
| Barras de progresso por macro vs. meta | R6.5.1 | E2E | PASS |
| Missing = "—", nunca "0%" | R6.5.1 | E2E | PASS |
| Layout 3 colunas desktop | R6.5.2 | E2E | PASS (só 2xl+, não xl — decisão de segurança documentada) |
| Navegação de refeições + meal ativo | R6.5.2 | E2E + unit | PASS |
| Badge de estrutura (Simples/Opções/Combinação) | R6.5.2 | E2E | PASS |
| Divisor "OU" em OPTIONS | R6.5.2 | E2E | PASS |
| Rótulo "Itens fixos" em COMBINATION | R6.5.2B | E2E + unit | PASS |
| Toolbar (status/save-state/CTA único/reuso R4-R5) | R6.5.2B | E2E | PASS (já existia, confirmado) |
| Compatibilidade R5 (SIMPLE/OPTIONS/COMBINATION via Copilot) | R6.5.2B | E2E | PASS |
| Compatibilidade R6 (item de receita) | R6.5.2B | E2E | PASS |
| Menu de ações da refeição consolidado (⋯) | R6.5.2C | E2E | PASS |
| Food row: hover-reveal de ações secundárias | R6.5.2C | E2E | PASS |
| Inline quantity/unit preservados | R6.5.2B/2C | E2E | PASS |
| R3 "Trocas" preservado | R6.5.2B/2C | E2E | PASS |
| Escape/Tab-trap unificado (drawer trocas, reuso, Copilot, receita) | R6.5.3 | E2E | PASS |
| Bug do "x" literal corrigido | R6.5.3 | E2E | PASS |
| Backdrop normalizado | R6.5.3 | leitura de código | PASS |
| **Food Search — redesign visual (header/estados)** | — | — | **NÃO IMPLEMENTADO** |
| **Substituição R3 — redesign de conteúdo (cards, comparação Atual→Novo)** | — | — | **NÃO IMPLEMENTADO** |
| **Reuso R4 — redesign de cards** | — | — | **NÃO IMPLEMENTADO** |
| **Receitas R6 — redesign de biblioteca/editor completo** | — | — | **NÃO IMPLEMENTADO** |
| **Copilot — stepper visual** | — | — | **NÃO IMPLEMENTADO** |
| Copilot — badge de prontidão com texto+ícone (3 estados reais; READY não mostrava nada antes) | R6.5.4 | E2E | PASS |
| Copilot — chips de resumo de revisão ("N resolvido(s)/N pra revisar/N não encontrado(s)") | R6.5.4 | E2E | PASS |
| **Extração de design system (DrawerShell/CompactEmptyState/etc.)** | — | — | **NÃO IMPLEMENTADO** |
| **Meal-card action menu (seção específica R6.5.2 original)** — consolidação de Duplicar/Copiar/Modelo/Excluir | R6.5.2C | E2E | PASS |
| **Food row — redesign visual completo (não só hover-reveal)** | — | — | **NÃO IMPLEMENTADO** (só compactação CSS, ver R6.5.2C) |
| Toolbar — "última alteração" (timestamp) | R6.5.4 | E2E | PASS (`updated_at` já existia na API, só não era lido) |
| Tablet/mobile — polish dedicado (além de regression-guard) | — | — | **NÃO IMPLEMENTADO** |

## Regra de conclusão (seção 146 do pedido)

Como itens visuais significativos permanecem abertos (Food Search,
Substituição, Reuso, Receitas e Copilot continuam com o VISUAL de
antes da R6.5 — só ganharam correções pontuais de acessibilidade e
bugs, não o redesign completo pedido nas 109+120+147 seções
acumuladas):

```
MEAL_PLAN_UI_R6_5_COMPLETE: nao
```

### Gaps exatos restantes

1. Food Search: nenhum redesign de header/estrutura/estados.
2. Substituição R3: conteúdo do drawer (cards de candidato, comparação
   Atual→Novo, seções colapsáveis de impacto) não redesenhado.
3. Reuso R4: cards de refeição salva/modelo/plano anterior não
   redesenhados.
4. Receitas R6: biblioteca (grid de cards) e editor completo
   (ingredientes/rendimento/instruções/nutrição) não redesenhados.
5. Copilot: sem stepper visual (o resto — badge de prontidão, chips
   de revisão — fechou na R6.5.4).
6. Nenhuma extração de componentes de design system compartilhados
   (`DrawerShell`, `CompactEmptyState`, `InlineErrorState`,
   `DrawerSearchField`, segmented control compartilhado, chip/badge
   compartilhado — os 2 usos novos da R6.5.4 ainda têm só 1
   consumidor cada, não justificando extração).
7. Food row: só compactação CSS (hover-reveal), não um redesign
   estrutural completo.
8. Nenhum sistema formal de loading/empty/error state (os estados
   existentes continuam consistentes o suficiente na prática, mas
   não foram unificados em componentes).
9. Tablet/mobile: nenhum polish dedicado além de confirmar que nada
   quebrou.

### O que fechou de verdade (não pequeno)

O Composer central (sidebar de nutrição, layout, navegação de
refeições, meal cards, OPTIONS/COMBINATION, toolbar, compatibilidade
R3/R4/R5/R6, acessibilidade de teclado unificada em todos os
diálogos, e agora o Assistente de IA com confirmação visual real de
prontidão e resumo de revisão) está genuinamente mais profissional e
sem nenhuma regressão introduzida em 6 fases consecutivas — cada uma
delas verificada com CI verde na SHA exata, full Vitest, e broad E2E
single-worker + paralelo. As áreas de suporte (Food Search/
Substituição/Reuso/Receitas) continuam funcionalmente intactas e
mais acessíveis por teclado, mas visualmente como estavam antes da
R6.5.

## Próximos passos sugeridos (não iniciados) — menor fase de fechamento possível

Dado que 6 fases consecutivas já entregaram tudo que era seguro
entregar de forma incremental e testada, e que o que resta (redesign
visual de 4 áreas de suporte inteiras + design system + estados +
polish responsivo) é genuinamente grande, a recomendação é **não**
abrir mais uma fase de escopo amplo. Se o objetivo é realmente fechar
`MEAL_PLAN_UI_R6_5_COMPLETE: sim`, o caminho mais seguro é UMA área
de suporte por fase, na ordem de menor risco:

1. **Food Search** (maior valor, mas risco alto — combobox mais usado
   e testado do app; exigiria migrar todos os testes que dependem da
   estrutura atual do listbox).
2. **Reuso R4** (risco médio — já tem Escape/foco unificados; cards
   são o item mais isolado de redesenhar).
3. **Receitas R6** (risco médio — já tem o bug do "x" e teclado
   corrigidos; falta só o visual da biblioteca/editor).
4. **Substituição R3** (risco mais alto — motor de equivalência
   clínico crítico, mexer no conteúdo do drawer exige cuidado extra
   mesmo mudando só apresentação).
5. **Design system + estados formais** — só depois de pelo menos 2
   das áreas acima estarem redesenhadas, pra ter consumidores reais
   suficientes que justifiquem a extração (`DrawerShell`,
   `CompactEmptyState`, etc.), evitando abstração prematura.

## STOP

Conforme instruído: não iniciando R7/Analytics. `MEAL_PLAN_ANALYTICS_R7_SAFE_TO_START`
não é declarado (só se aplicaria se `MEAL_PLAN_UI_R6_5_COMPLETE: sim`,
que não é o caso).
