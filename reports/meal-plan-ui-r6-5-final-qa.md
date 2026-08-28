# Meal Plan Composer UX/UI R6.5 — Fechamento Geral (Fases 1 → 3)

## Histórico de fases

| Fase | PR | Commit | Entregue |
| --- | --- | --- | --- |
| R6.5.1 | #10 | 46c91bd | Nutrition Sidebar: energia/meta, barras de progresso por macro, missing seguro ("—") |
| R6.5.2 | #11 | 6d8dec8 | Layout 3 colunas (só 2xl+), navegação de refeições, meal ativo, badge de estrutura, divisor "OU" |
| R6.5.2B | #12 | 1cc9dff | Rótulo COMBINATION, compatibilidade R5 (SIMPLE/OPTIONS/COMBINATION via Copilot real) e R6 (receita), toolbar/inline quantity confirmados |
| R6.5.2C | #13 | 35aefc3 | Menu de ações da refeição consolidado (⋯, acessível), food row com hover-reveal |
| R6.5.3 | (esta) | — | Hook de teclado compartilhado; Escape/Tab-trap retrofitado no Copilot e no modal de receita (gap real fechado); bug do "x" corrigido; backdrop normalizado |

Todas as 5 fases fecharam com CI verde na SHA exata e zero regressão
introduzida (confirmado por reexecução ampla a cada fechamento).

## Matriz de requisitos (seção 134 do pedido R6.5.3)

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
| **Copilot — chips de resumo de revisão (X resolvidos/Y revisar/Z não encontrado)** | — | — | **NÃO EXISTE** (confirmado pela auditoria — nem antes nem depois desta fase) |
| **Copilot — badges de prontidão com texto+ícone** | — | — | **NÃO IMPLEMENTADO** |
| **Extração de design system (DrawerShell/CompactEmptyState/etc.)** | — | — | **NÃO IMPLEMENTADO** |
| **Meal-card action menu (seção específica R6.5.2 original)** — consolidação de Duplicar/Copiar/Modelo/Excluir | R6.5.2C | E2E | PASS |
| **Food row — redesign visual completo (não só hover-reveal)** | — | — | **NÃO IMPLEMENTADO** (só compactação CSS, ver R6.5.2C) |
| Toolbar — "última alteração" (timestamp) | — | — | **NÃO IMPLEMENTADO** (exigiria mudança de contrato de API) |
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
5. Copilot: sem stepper visual, sem chips de resumo de revisão (que
   nem existem hoje como conceito), sem badges de prontidão
   texto+ícone.
6. Nenhuma extração de componentes de design system compartilhados
   (`DrawerShell`, `CompactEmptyState`, `InlineErrorState`,
   `DrawerSearchField`, segmented control compartilhado).
7. Food row: só compactação CSS (hover-reveal), não um redesign
   estrutural completo.
8. Toolbar: falta o timestamp de "última alteração".
9. Tablet/mobile: nenhum polish dedicado além de confirmar que nada
   quebrou.

### O que fechou de verdade (não pequeno)

O Composer central (sidebar de nutrição, layout, navegação de
refeições, meal cards, OPTIONS/COMBINATION, toolbar, compatibilidade
R3/R4/R5/R6, e agora acessibilidade de teclado unificada em todos os
diálogos) está genuinamente mais profissional e sem nenhuma
regressão introduzida em 5 fases consecutivas — cada uma delas
verificada com CI verde na SHA exata, full Vitest, e broad E2E
single-worker + paralelo. As áreas de suporte (Food Search/
Substituição/Reuso/Receitas/Copilot) continuam funcionalmente
intactas e agora mais acessíveis por teclado, mas visualmente como
estavam antes da R6.5.

## Próximos passos sugeridos (não iniciados)

Uma fase R6.5.4 (ou equivalente) dedicada exclusivamente ao redesign
visual das 5 áreas de suporte, feita uma de cada vez (não todas
simultaneamente, dado o histórico de regressões nesta base de código
quando mudanças amplas são tentadas de uma vez), seria o caminho mais
seguro pra fechar os gaps acima.

## STOP

Conforme instruído: não iniciando R7/Analytics. `MEAL_PLAN_ANALYTICS_R7_SAFE_TO_START`
não é declarado (só se aplicaria se `MEAL_PLAN_UI_R6_5_COMPLETE: sim`,
que não é o caso).
