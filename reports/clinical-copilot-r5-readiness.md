# Clinical Copilot R5 — Contrato de Prontidão (Readiness)

## Estados

`lib/ai/agents/nutrition/meal-plan-readiness.ts` — `NOT_READY | READY_WITH_REVIEW | READY`,
computados por `computeMealPlanReadiness`, puro (sem I/O), a partir do MESMO
objeto de contexto já buscado por `/draft/context` (nenhuma segunda fonte de
dados).

## Regra (documentada, auditada — não arbitrária)

- **NOT_READY**: nem antropometria (peso E altura) nem objetivo clínico
  registrado. Idade sozinha (quase sempre disponível via data de nascimento)
  não é suficiente pra propor uma estrutura com segurança — sem peso/altura
  OU um objetivo, não há nenhuma base real pra ancorar porções/estrutura.
  Mensagem: *"Faltam informações para gerar uma proposta segura."* — o
  Copilot nunca gera nada silenciosamente neste estado.
- **READY_WITH_REVIEW**: gera, mas sinaliza o que falta — antropometria
  incompleta, objetivo ausente, alergias/restrições nunca revisadas
  (`null`, distinto de string vazia — missing≠zero, seção 49), idade não
  calculável.
- **READY**: todos os itens críticos presentes e revisados.

## Missing ≠ zero (seção 49)

`allergies`/`restrictions` usam `!== null` (nunca `.trim()`/truthy) como
critério de "revisado" — uma string vazia (nutricionista revisou e não há
nada a registrar) conta como revisado; `null` (nunca perguntado, registro de
nutrição nunca criado) conta como pendente. Testado explicitamente em
`tests/meal-plan-readiness.test.ts`.

## Onde aparece

Etapa "Dados do paciente" do wizard (`AiMealPlanWizard.tsx`) — banner
condicional logo após os dados considerados: vermelho e com a mensagem
bloqueante quando `NOT_READY` (mas o wizard continua ABERTO — o texto
apenas avisa; a nutricionista decide se quer prosseguir mesmo assim ou
completar o prontuário primeiro), âmbar com a lista de pendências quando
`READY_WITH_REVIEW`, nada quando `READY`.

## Por que não bloqueia a abertura do wizard

O pedido diz "não gerar draft silenciosamente" — não "impedir o wizard de
abrir". Bloquear a abertura do wizard inteiro para `NOT_READY` seria mais
restritivo que o pedido exige e removeria a opção de a nutricionista revisar
o contexto ali mesmo antes de decidir. A mensagem aparece assim que o
contexto carrega, ANTES de qualquer geração ser possível — a decisão de
prosseguir mesmo com o aviso continua sendo humana.

## Testes

`tests/meal-plan-readiness.test.ts` (8 casos): NOT_READY com idade conhecida
mas sem antropometria/objetivo; READY completo; READY_WITH_REVIEW por
antropometria incompleta, por objetivo ausente, por alergias/restrições
não revisadas, por idade ausente; string vazia tratada como revisada;
presença de QUALQUER um de antropometria/objetivo evita NOT_READY.
`e2e/clinical-copilot-r5-readiness-changeset.spec.ts` prova ponta a ponta
que o aviso aparece no wizard real para um paciente com prontuário em
branco, e que o botão "Usar plano anterior como base" só aparece quando o
paciente já tem pelo menos um plano com refeições.
