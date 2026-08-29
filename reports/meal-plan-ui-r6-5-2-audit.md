# Meal Plan Composer UX/UI R6.5.2 — Auditoria pré-refactor

## Objetivo do pedido

Fechar o layout principal profissional do Composer: 3 colunas desktop
(navegação de refeições / editor / nutrição), meal cards compactos,
food rows redesenhados, toolbar/menus contextuais, visual de OPTIONS/
COMBINATION, responsividade tablet/mobile, e acessibilidade desta
camada — desta vez obrigatória (não pode fechar com FAIL como a R6.5.1).

## Auditoria (feita antes de qualquer edição, via agente de pesquisa)

Mapeamento completo de `MealPlanEditor.tsx` (grid 2 colunas existente:
centro + `<aside>` de nutrição, breakpoint `xl:`/`2xl:`) e
`MealItemsEditor.tsx` (toolbar "Refeicoes" + cards `<article>` com
header/ações/estrutura SIMPLE-OPTIONS-COMBINATION/food rows). Inventário
exaustivo de seletores E2E existentes (headings, aria-labels indexados
de OPTIONS/COMBINATION, placeholders, classes CSS como `p.text-lg`,
`[role="progressbar"]`) — usado para não repetir a regressão de
seletor da R6.5.1.

**Achado crítico da auditoria**: os food rows de `MealItemsEditor.tsx`
usam larguras mínimas fixas em pixels (`minmax(0,150px)`, `120px`,
`minmax(140px,190px)`, `190px`, `180px`, etc.) — a coluna central não
pode ser arbitrariamente estreitada sem risco de quebrar esses
layouts. Isso só foi confirmado na prática durante o fechamento (ver
`-final-qa.md`), não integralmente antecipado pela auditoria estática.

## O que foi entregue nesta fase

1. **Navegação de refeições** (`components/dashboard/MealNavigationRail.tsx`,
   novo componente) — lista horário/nome de cada refeição, clique rola
   até o card (`scrollIntoView`), destaque do item ativo via
   `IntersectionObserver` (`aria-current="true"`, sempre exatamente 1).
   Deriva de `plan.meals` diretamente (sem estado próprio a
   sincronizar) — adicionar/excluir/reordenar refeição atualiza a nav
   automaticamente.
2. **Badge de estrutura** (Simples/Opções/Combinação) no header de
   cada meal card — puramente visual, não altera `meal_structure` nem
   cálculo.
3. **Divisor "OU"** entre alternativas de OPTIONS — visual apenas
   (`aria-hidden`), não altera `options`/aria-labels indexados.
4. **Layout 3 colunas**, mas **restrito a telas largas (2xl, 1536px+)**
   — decisão tomada após uma regressão real ser encontrada e corrigida
   no breakpoint original `xl` (1280px); ver `-final-qa.md` para o
   relato completo. Em `xl` (1280px, viewport padrão do E2E/muitos
   monitores), o layout permanece EXATAMENTE o de 2 colunas da R6.5.1.

## Escopo conscientemente FORA desta fase

- Consolidação de meal cards (mover Duplicar/reordenar pro menu "⋯").
- Redesign de food rows (linha compacta, hover-actions, edição inline
  redesenhada) — os food rows continuam com o padrão já existente
  (colapsado/edição por `editingItemKey`, sem mudança visual).
- Visual de COMBINATION além do que já existia (título/min-max já
  eram exibidos antes desta fase).
- Toolbar/status badge/save-feedback consolidados.
- Atalhos de teclado (Ctrl/Cmd+S), scroll-to-new-meal, foco após
  adicionar alimento.
- Banners de erro inline, skeleton loading.
- Drawers padronizados (Food Search/Substituição/Reuso/Receita),
  integração visual do Copilot.
- Matriz de compatibilidade formal R3/R4/R5/R6 (coberta indiretamente
  pela regressão real encontrada e corrigida — ver `-final-qa.md` —
  mas não testada como matriz dedicada).
- Medição formal de performance (p50/p95), tooling de acessibilidade
  dedicado (axe).
- Modo de densidade, extração de design system.

## Tabela de decisão de escopo (requisito × entregue)

| Requirement | Implemented | Tested | Status | Reason |
| --- | --- | --- | --- | --- |
| 3-column desktop layout | Sim (só 2xl+) | Sim (E2E) | PARCIAL | Regressão real forçou restringir a 2xl; ver `-final-qa.md` |
| Meal navigation (lista + clique + ativo) | Sim | Sim (E2E + unit) | PASS | — |
| Active meal (IntersectionObserver) | Sim | Sim (E2E) | PASS | — |
| Add/delete/reorder meal nav sync | Sim (por derivação de props) | Sim (unit) | PASS | Sem estado próprio a sincronizar |
| Compact meal card header (consolidar ações no ⋯) | Não | Não | NOT_IMPLEMENTED | Risco de quebrar 6+ specs que testam botões dedicados |
| Structure badge | Sim | Sim (E2E) | PASS | — |
| Food row redesign / inline editing visual | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo; risco alto dado os testes existentes |
| OPTIONS "OU" divider | Sim | Sim (E2E) | PASS | — |
| COMBINATION visual overhaul | Não | Não | NOT_IMPLEMENTED | Já havia texto min/max; não expandido |
| Top toolbar refinement | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo |
| Tablet/mobile dedicated layout | Não (nav simplesmente oculta) | Sim (E2E, não-quebra) | PARCIAL | Sem redesenho dedicado, só regressão coberta |
| Accessibility (nav) | Sim | Sim (E2E: landmark/teclado/aria-current) | PASS | Escopo restrito à nav nova, não ao Composer inteiro |
| R3/R4/R5/R6 compatibility matrix | Não (dedicada) | Parcial (via regressão real) | PARCIAL | 4 specs de R4 quebraram e foram corrigidas; não há matriz formal nova |
| Keyboard shortcuts / Ctrl+S / scroll-to-new-meal / focus-after-add | Não | Não | NOT_IMPLEMENTED | Fora do escopo de tempo |
| Performance metrics formais | Não | Não | NOT_IMPLEMENTED | Ver `-performance.md` |

## Decisão de fechamento

Fecha como escopo real: navegação de refeições + badge de estrutura +
divisor OU, restrito a telas 2xl+, com uma regressão real encontrada e
corrigida durante o próprio fechamento (documentada integralmente em
`-final-qa.md`). `MEAL_PLAN_UI_R6_5_2_COMPLETE: nao` — a maior parte
do pedido de 120 seções não foi implementada.
