# R6.5.6 — Acessibilidade da Biblioteca de Reuso

## Preservado (reutilização de infraestrutura de R6.5.3)

- `role="dialog"` `aria-modal="true"` `aria-labelledby="reuse-title"`.
- Escape fecha o drawer e devolve o foco ao botão que o abriu — via
  `useDialogKeyboard` (hook compartilhado, não modificado nesta fase).
  Confirmado por E2E: `acessibilidade: Escape fecha a biblioteca e devolve
  o foco ao botão que abriu` — PASS sem alterações.
- Focus-trap: Tab/Shift+Tab nunca escapam do diálogo (mesmo hook).
- Foco inicial no botão de fechar ao abrir (`requestAnimationFrame`).
- `role="tablist"`/`role="tab"`/`aria-selected` nas 4 abas, com navegação
  por seta esquerda/direita e wraparound — confirmado por leitura de
  código (padrão ARIA tablist correto).

## Corrigido nesta fase

**Bug 2 (ver auditoria)**: os botões "Usar" (aba Refeições) e "Adicionar"
(aba Planos, refeições dentro de um plano expandido) não tinham nenhum
nome acessível ligado à refeição — um usuário de leitor de tela ouviria
apenas "Usar, botão" ou "Adicionar, botão" repetidamente, sem saber a qual
refeição cada botão correspondia, quando há múltiplas refeições na lista.
Corrigido com `aria-label={`Usar ${meal.name}`}` e
`aria-label={`Adicionar ${meal.name}`}` — o texto visível ("Usar"/
"Adicionar") permanece inalterado; apenas o nome acessível computado
passou a incluir o contexto da refeição.

## Não relacionado a esta fase (documentado, não corrigido)

Dois problemas de acessibilidade real foram confirmados como
determinísticos em `mobile-chrome` durante a verificação ampla, em
componentes fora do escopo desta fase (AI chat widget e diálogo do
Clinical Copilot) — ver `reports/meal-plan-ui-r6-5-6-responsive.md` e o
gap tracker em `reports/meal-plan-ui-r6-5-final-qa.md`.
