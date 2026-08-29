# Meal Plan Composer UX/UI R6.5.5 — Acessibilidade

## Entregue

- **Loading**: agora anunciado como `role="status" aria-label="Buscando alimentos"`
  — leitores de tela recebem uma região de status real, não um
  parágrafo solto sem contexto semântico.
- **"Adicionar"**: continua dentro do MESMO `role="option"` já
  existente — não introduz um controle interativo separado (evitando
  o "botão dentro de botão" inválido e a ambiguidade de duas ações
  na mesma linha que a seção 15 do pedido avisa pra evitar). O nome
  acessível da opção inteira continua vindo do texto visível
  (`displayName` + "Adicionar" + linhas 2-3), sem quebrar nenhuma
  leitura de tela.
- Nenhuma informação passou a depender só de cor — a mudança de
  "Adicionar" é texto, não um ícone colorido isolado.

## Verificado (sem regressão)

- `input[aria-label="Alimento"]`, `role="combobox"`,
  `aria-activedescendant`, `role="option"`, `aria-selected` — todos
  inalterados, testados pela suíte `food-search-multi-source.spec.ts`
  (incluindo o teste dedicado de navegação por teclado).

## Não auditado nesta fase

Nenhuma auditoria formal de contraste dos tokens de cor usados (são
os mesmos já existentes no app, reaproveitados). Nenhuma auditoria de
leitor de tela real (NVDA/VoiceOver).

## Gate

`MEAL_PLAN_UI_R6_5_5_ACCESSIBILITY: PASS` para o escopo real desta
fase — loading semântico + preservação total do contrato de
acessibilidade já existente do combobox.
