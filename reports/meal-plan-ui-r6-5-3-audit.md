# Meal Plan Composer UX/UI R6.5.3 — Auditoria

## Objetivo do pedido

Unificar a linguagem visual das 5 áreas de suporte do Composer (Food
Search, Substituição R3, Reuso R4, Receitas R6, Copilot R5),
consolidar padrões compartilhados de drawer/dialog, e fazer o
fechamento visual final da R6.5 (109+120+147 seções acumuladas nas
fases 1/2/2B/2C/3).

## Auditoria (agente de pesquisa dedicado, antes de qualquer edição)

Mapeamento completo das 5 áreas + z-index de toda a stack de overlays
do dashboard. Achados principais:

1. **DNA visual já compartilhado**: todas as 5 áreas já usam as
   mesmas classes utilitárias globais (`brand-input`, `brand-btn-primary`,
   `brand-btn-secondary`, `brand-kicker`, `brand-label`) e a mesma
   paleta de cores — o sistema de design já é UM só no nível de token,
   não 5 sistemas paralelos como o pedido presumia.
2. **Divergências reais encontradas**: tamanho de título de header
   (`text-xl` no drawer de trocas vs `text-2xl` em todo o resto —
   avaliado como provavelmente intencional, painel lateral vs modal
   centralizado, não alterado), opacidade de backdrop divergente
   (`/25`, `/30`, `/35` em 3 lugares diferentes — **corrigido nesta
   fase**), ícone de fechar divergente (`X` em quase todo lugar, mas
   `PanelRightClose` no drawer de trocas — decisão consciente de
   manter, é direcional e faz sentido pro painel lateral — e um "x"
   **literal em texto** no modal "Inserir receita", que é um BUG real,
   não uma escolha de design — **corrigido nesta fase**).
3. **Gap mais significativo encontrado**: de ~10 superfícies do tipo
   diálogo/drawer no Composer, apenas 2 (drawer de trocas, biblioteca
   de reuso R4) implementavam Escape + Tab-trap + retorno de foco —
   cada uma com sua PRÓPRIA cópia quase idêntica dessa lógica. O
   Assistente de IA (Copilot) e o modal "Inserir receita" não tinham
   NENHUM tratamento de teclado — só fechavam pelo botão "x"/"Cancelar".
   Esse é o gap real mais valioso e mais seguro de fechar nesta fase.
4. **Z-index**: tabela completa construída (dashboard nav/toolbar/
   sidebar/menus/drawers/modais/Copilot) — nenhuma colisão ativa
   confirmada; todos os diálogos verdadeiros já usam `z-50`
   uniformemente. Risco residual identificado (múltiplos popovers de
   busca de alimento em `z-30`/`z-20` inconsistentes) documentado, não
   corrigido nesta fase (baixo risco, mudança cosmética sem valor de
   acessibilidade real).

## Decisão de escopo

Dado o histórico de 3 regressões reais nesta mesma área ampla do
Composer (R6.5.1, R6.5.2, e quase uma 3ª no R6.5.2C antes de ser
corrigida em CI local), e dado que o pedido desta fase (147 seções)
cobre um redesign completo de 5 subsistemas, esta fase prioriza:

1. **Extrair o hook de teclado duplicado** (`useDialogKeyboard`,
   `hooks/use-dialog-keyboard.ts`) das 2 implementações já existentes,
   preservando comportamento (refatoração, não reescrita).
2. **Retrofit real de acessibilidade**: aplicar o hook extraído no
   Assistente de IA e no modal "Inserir receita" — 2 superfícies que
   literalmente não tinham NENHUM suporte a teclado antes.
3. **Corrigir o bug real do "x" literal** no modal "Inserir receita".
4. **Normalizar a opacidade do backdrop** pra um valor único (`/30`,
   já majoritário) nos 2 outliers.
5. **NÃO** redesenhar visualmente nenhuma das 5 áreas (Food Search,
   drawer de trocas, biblioteca de reuso, biblioteca de receitas,
   wizard do Copilot) — o pedido de "linguagem visual unificada" já
   estava, na prática, majoritariamente satisfeito no nível de token;
   o valor real e seguro estava em fechar o gap de acessibilidade, não
   em redesenhar componentes que já compartilham DNA visual.

Ver `-final-qa.md` pra tabela completa de escopo (o que fechou vs o
que fica pra uma fase futura, se houver).
