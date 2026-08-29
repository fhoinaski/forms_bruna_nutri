# R6.5.6 — Responsividade da Biblioteca de Reuso

## Mobile (folha inferior)

`role="dialog"` usa `items-end` em telas pequenas (abre como bottom sheet,
`rounded-t-2xl`, `h-[88dvh]`) e `sm:items-center`/`sm:rounded-[1.25rem]` em
telas ≥ 640px (modal centralizado). Confirmado via E2E
(`mobile: biblioteca abre como folha inferior`, viewport 390×844): largura
> 340px, PASS sem alterações.

## Grid de abas

`grid-cols-4` fixo — as 4 abas sempre cabem lado a lado mesmo em mobile,
sem overflow horizontal (rótulos curtos: Itens/Refeições/Planos/Modelos).
Confirmado por leitura de código; nenhum teste E2E dedicado a overflow de
abas em mobile, mas a suíte completa de E2E mobile (`mobile-chrome`) não
revelou nenhuma quebra de layout na biblioteca de reuso.

## Achado relevante (fora do escopo desta fase)

Durante a verificação em `mobile-chrome`, dois bugs de layout mobile
**pré-existentes e não relacionados a este componente** foram confirmados
como determinísticos (não flakes):

- O botão "Abrir Assistente de IA" (widget de chat de IA, componente
  diferente) fica fora da viewport mobile.
- O diálogo do Clinical Copilot tem 2 elementos "Fechar" simultâneos
  visíveis no viewport mobile (colisão com o menu de navegação mobile).

Nenhum dos dois toca a Biblioteca de Reuso ou qualquer arquivo desta fase;
documentados como gap para uma fase futura em
`reports/meal-plan-ui-r6-5-final-qa.md`.
