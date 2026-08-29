# Meal Plan Composer UX/UI R6.5.3 — Clinical Copilot (R5)

## Entregue: o gap mais significativo desta fase

O Assistente de IA (`AiMealPlanWizard.tsx`, 1783 linhas) **não tinha
nenhum tratamento de teclado** antes desta fase — nem Escape, nem
Tab-trap, nem retorno de foco. Era a única superfície do tipo diálogo
em todo o Composer com esse gap total (as outras 3 tinham pelo menos
parcial). Corrigido com o hook compartilhado `useDialogKeyboard`
(ver `-drawers.md`): Escape agora fecha o wizard, Tab não escapa do
diálogo. Prova real por E2E dedicado (2 testes novos).

Backdrop normalizado (`/35` → `/30`, mesmo valor do resto do app).

## Achados da auditoria não corrigidos nesta fase

1. **Sem indicador visual de etapas (stepper)** — o wizard mostra
   "Etapa N de M · {rótulo}" como texto plano, não um stepper visual
   compacto (seção 55 do pedido). Não implementado.
2. **Chips de resumo de revisão** ("12 resolvidos · 2 revisar · 1 não
   encontrado", seção 58) — **não existem hoje**. O equivalente mais
   próximo é uma frase solta sobre itens sem correspondência
   (`draft.nutrition.unresolvedCount`) e um contador interno
   (`totalNeedsReview`) que é computado mas não renderizado como chip
   visível em nenhum lugar encontrado pela auditoria. Gap real
   confirmado, não fechado nesta fase.
3. **Estados de prontidão como badge com texto+ícone** ("Pronto" /
   "Pronto com revisão" / "Faltam informações", seção 56) — o motor
   (`computeMealPlanReadiness`) já calcula 3 status reais
   (`NOT_READY`/`READY_WITH_REVIEW`/`READY`), mas a UI só renderiza a
   primeira razão como frase + lista de bullets dentro de um card
   colorido — não como um badge dedicado com essas 3 palavras
   exatas. Não implementado.
4. **Breadcrumb de revisão aninhada** (seção 59) — já existe como
   frase única ("Precisa de revisão — {refeição} → {opção/grupo}"),
   não como um componente de breadcrumb visual dedicado. Considerado
   funcionalmente equivalente ao pedido (a informação de navegação
   está presente e correta), não redesenhado.

## Por que não fechar os itens 1-4 acima

Cada um exige adicionar NOVA UI (não apenas corrigir/reorganizar o
que já existe) num componente de 1783 linhas que já é o motor mais
complexo e crítico do Composer (geração real por LLM, resolução de
alimentos, changeset de plano anterior, revisão aninhada de OPTIONS/
COMBINATION). Dado o orçamento desta fase e o valor mais alto e mais
seguro já identificado (fechar o gap de teclado, que era total, não
parcial), esses 4 itens ficam como gaps reais e documentados, não
escondidos — candidatos concretos pra uma fase R6.5.4 dedicada ao
Copilot, se houver.

## Gate

`MEAL_PLAN_UI_R6_5_3_COPILOT: PASS` para o que foi entregue
(acessibilidade de teclado, antes inexistente); `FAIL`/parcial para o
redesign visual completo pedido (stepper, chips de resumo, badges de
prontidão) — não implementado.
