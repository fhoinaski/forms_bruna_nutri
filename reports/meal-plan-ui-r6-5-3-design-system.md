# Meal Plan Composer UX/UI R6.5.3 — Design system

## Achado principal

Contrário à premissa do pedido ("hoje podem parecer módulos
separados"), a auditoria confirmou que as 5 áreas JÁ compartilham um
design system real no nível de token: `brand-input`,
`brand-btn-primary`, `brand-btn-secondary`, `brand-kicker`,
`brand-label` (definidos em `app/globals.css`) são usados
consistentemente em Food Search, drawer de trocas, biblioteca de
reuso, receitas, e Copilot. A mesma paleta de cores
(`#3A3028`/`#75675E`/`#8C6E52`/`#EDE1D6`/`#EAD8C2`/`#607A56`/`#7F9A74`)
aparece em todos os 5 lugares.

## Consolidação real entregue

`hooks/use-dialog-keyboard.ts` — a única duplicação de LÓGICA (não
apenas visual) genuína encontrada entre as 5 áreas: Escape+Tab-trap
copy-pasted em 2 lugares, agora 1 hook compartilhado, usado em 4
lugares.

## Não extraído (decisão consciente, seção 68 do pedido)

- `DrawerShell`/`Drawer` genérico — os 3 layouts reais (painel
  lateral do drawer de trocas, modal centralizado da biblioteca de
  reuso/receitas, wizard do Copilot) são genuinamente diferentes o
  suficiente pra que uma abstração forçada agora, sem mais casos de
  uso reais, corra o risco de virar a "abstração gigante com 30
  props" que o próprio pedido avisa pra evitar.
- `CompactEmptyState`/`InlineErrorState`/`DrawerSearchField`/segmented
  control compartilhado — identificados pela auditoria como
  candidatos reais (o padrão de erro amber/red já é visualmente
  idêntico nos 3-4 lugares onde aparece), mas não extraídos nesta
  fase — o valor de consolidar strings/classes JSX que já são
  visualmente idênticas é baixo frente ao risco de introduzir uma
  regressão tocando em 4+ arquivos simultaneamente.

## Correções pontuais de token

- Backdrop opacity normalizado pra `/30` (era `/25`, `/30`, `/35` em
  3 lugares — ver `-drawers.md`).
- Ícone de fechar do modal "Inserir receita" corrigido de texto "x"
  literal pra `<X>` (lucide-react), igual ao resto do app.

## Gate

`MEAL_PLAN_UI_R6_5_3_DESIGN_SYSTEM: PASS` para a consolidação real
entregue (hook de teclado + 2 correções de token) — não uma extração
completa de componentes visuais compartilhados.
