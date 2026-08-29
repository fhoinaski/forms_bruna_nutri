# Meal Plan Composer UX/UI R6.5.2C — Food row

## Achado da auditoria

O menu de ações do alimento (Editar/Bloquear/Pausar sugestões/Mover/
Duplicar/Excluir) **já estava consolidado** num "⋯" próprio
(`aria-label="Mais ações do alimento"`) desde antes desta fase — o
pedido da R6.5.2 (seção 16) já estava satisfeito. Por isso o escopo
real desta fase para o food row foi puramente visual.

## Mudança entregue

Compactação por CSS, sem alteração estrutural:
- O container da linha ganhou a classe `group`.
- O botão "Mais ações do alimento" ganhou
  `md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100`
  — em desktop (`md:` = 768px+), fica invisível até o mouse passar
  sobre a linha OU algum elemento dela receber foco; em telas menores
  que `md:` (tablet estreito/mobile), a classe `md:opacity-0` não se
  aplica, então o botão fica **sempre visível** (seção 19: "No
  hover-only controls" no mobile).
- Quando o menu do item está aberto (`openItemMenu === key`), o botão
  fica forçado a opacidade 100% independente de hover — evita o botão
  "sumir" enquanto o menu que ele abriu ainda está na tela.
- Nenhum `aria-label`, `handler`, ou estrutura de grid foi alterado.

## Por que não uma reestruturação maior

Ver `-audit.md`: o menu de ações já existia; quantidade/unidade
inline já eram compactas e agrupadas (confirmado na R6.5.2B); mexer
na estrutura de grid dos food rows (larguras mínimas fixas em pixels,
usadas em múltiplas variações colapsada/edição) é exatamente a classe
de mudança que já causou 2 regressões reais nas fases R6.5.1 e
R6.5.2. O ganho real (hover-reveal do botão secundário) foi entregue
sem esse risco.

## Prova (E2E dedicado)

`e2e/meal-plan-ui-r6-5-2c-closure.spec.ts`, teste "food row: ações
secundárias...": confirma que o botão "Mais ações do alimento"
continua no DOM, é focável programaticamente (`focus()`/`toBeFocused()`
— não depende de simular hover real do mouse, que Playwright não
simula de forma confiável para `:hover`), e clicável — abre o menu
"Editar" corretamente. **PASS**.

## `INLINE_QUANTITY`/`INLINE_UNIT` (reconfirmados, não tocados)

Teste dedicado "quantidade/unidade e R3 continuam intactos..."
confirma: editar quantidade continua funcionando, "Trocas" (R3)
continua com pelo menos 1 entrada visível, e abrir/fechar o NOVO menu
de refeição não interfere na edição do item (`input[aria-label="Quantidade"]`
continua com contagem 1, não duplicado/quebrado).
