# Meal Plan Composer UX/UI R6.5 — Design system

## Decisão

Nenhum componente de design system novo foi extraído nesta fase.

O pedido é explícito em avisar contra sobre-componentizar sem
justificativa real de reuso (seção correspondente do pedido). O único
componente novo criado — `ProgressBar` — foi mantido **local e não
exportado** dentro de `components/nutrition/MealPlanNutritionSummary.tsx`,
porque seu único uso real, nesta fase, é dentro do próprio painel de
nutrição (3 instâncias: proteína/carboidrato/gordura). Extraí-lo para um
módulo compartilhado (`components/ui/NutritionProgress.tsx` ou
similar) antes de haver um SEGUNDO consumidor real seria a
sobre-abstração que o próprio pedido pede pra evitar.

## Candidatos a extração futura (não feitos agora, por falta de 2º uso real)

- `ProgressBar` → viraria `NutritionProgress` se o Copilot ou outro
  painel (ex.: resumo do plano publicado) precisar da mesma barra.
- `Panel`/`SectionHeader`/`CompactButton`/`StatusBadge`/`Drawer`/
  `SegmentedControl` — nenhum foi necessário nesta fase porque nenhuma
  das áreas que os usariam (toolbar, drawers, cards de refeição) foi
  tocada.

## Tokens de cor usados (paleta já existente do projeto, reaproveitada)

Nenhum token novo foi criado. As cores usadas no `ProgressBar` e no
header de energia reaproveitam o mesmo vocabulário hexadecimal já em
uso no resto de `MealPlanNutritionSummary.tsx` (`#3A3028`, `#8C6E52`,
`#75675E`, `#EDE1D6`, `#FAF7F2`, `#7F9A74` para "no alvo", `#C9937B`
para "fora da faixa", `#D9CFC3` para "sem dado") — sem introduzir uma
paleta paralela.

## Auditoria formal de tipografia/espaçamento/tokens semânticos (seção 101-105 do pedido)

NÃO realizada nesta fase — ver `-audit.md`, escopo fora.
