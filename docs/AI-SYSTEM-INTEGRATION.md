# Como o assistente de IA cresce junto com o CRM

Este documento é o checklist de integração: como uma feature nova do CRM
ganha capacidade de IA sem o assistente ficar desatualizado. Para a
arquitetura em si (orquestradores, gateway, políticas de risco), ver
`docs/AI-ARCHITECTURE.md`. Para o estado atual vs. o objetivo de "operador
interno" e o roadmap de fases, ver `docs/AI-OPERATOR-AUDIT-ROADMAP.md`.

## As peças, em uma frase cada

- **Gateway** (`lib/ai/gateway/ai-gateway.ts`) — única porta para o provider de IA. Nunca chamado direto por um agente.
- **Orquestrador** (`lib/ai/core/ai-orchestrator.ts` admin, `patient-orchestrator.ts` paciente) — monta prompt + tools ativas do contexto, roda o turno, devolve o envelope de resposta.
- **Tool registry** (`lib/ai/tools/registry.ts`) — toda capacidade que o LLM pode invocar, com risco/perfil/domínio declarados.
- **Capability manifest** (`lib/ai/tools/capability-manifest.ts`) — visão derivada do registry, agrupada por domínio; é o que você consulta para saber "o que já existe" antes de propor uma tool nova.
- **Agente de domínio** (`lib/ai/agents/<dominio>/*.ts`) — onde vive a lógica de negócio de uma tool (schema, `execute`, builder de contexto).
- **Policies** (`lib/ai/policies/`) — `risk` decide se uma ação executa sozinha ou exige confirmação; `profiles` decide quem pode usar a tool.
- **Proposals** (`ai_action_proposals`/`ai_proposal_executions`) — todo write `sensitive`/`clinical` passa por aqui: propor → confirmar → executar com revalidação total.
- **Privacy** (`lib/ai/privacy/`) — sanitização de dado clínico/PII antes de compor um prompt.

## Checklist: adicionando uma feature nova ao assistente

Toda feature nova do CRM que deve ficar visível ao assistente declara, no
mínimo, o seguinte antes de a tool ser considerada "pronta":

1. **Domínio** — qual dos domínios existentes ela pertence (`lib/ai/tools/capability-types.ts`: `patient`, `appointment`, `clinical`, `meal_plan`, `food`, `nutrition_analysis`, `finance`, `request`, `dashboard`, `content`, `document`, `configuration`, `admin`, `navigation`). Se nenhum encaixa, é uma decisão consciente adicionar um domínio novo — não force um encaixe errado só para não mexer no enum.
2. **Read ou write** — leitura nunca precisa de confirmação; write de negócio não-clínico é `sensitive`; qualquer coisa que toque prontuário/conduta/dado de saúde é `clinical`, sem exceção.
3. **Tools de leitura e escrita** — nomeadas e registradas separadamente (ex.: `get_payment_details` read, `record_payment` write) — nunca uma tool só que decide sozinha o que fazer.
4. **Permissões/perfil** — `ADMIN_ASSISTANT`, `PATIENT_ASSISTANT`, ou os dois (nunca a mesma tool nos dois profiles se o dado for de escopo diferente — ver a política de nunca vazar `clientId` escolhido pelo modelo no perfil do paciente).
5. **Entity types** — quais entidades a tool lê/afeta (`lib/ai/tools/capability-types.ts`), para o capability manifest indexar corretamente.
6. **`dataSensitivity`** (`"safe" | "sensitive" | "clinical"`, `lib/ai/tools/capability-types.ts`, FASE 2A) — classifique honestamente inspecionando o OUTPUT real do `execute`, não o nome da tool: `safe` = não identifica paciente ou não carrega dado de negócio; `sensitive` = identifica paciente + financeiro/agenda com nota livre/texto de solicitação; `clinical` = prontuário/marcadores/plano terapêutico/antropometria. Se a tool devolve QUALQUER campo de texto livre de origem paciente (`patientText`, `notes`, `aiSummary`, `objective`), aplique `sanitizePatientFreeTextForToolOutput`/`truncateForToolOutput` (`lib/ai/privacy/sanitize-context.ts`) nesse campo antes de retornar — nunca devolva o repository object inteiro sem passar por essa camada.
7. **Descrição da tool para o assistente** — a `description` no registry é o que o LLM lê para decidir usar a tool; escreva pensando nisso, não como comentário de código para humano.

### Passo a passo mecânico

1. No repositório real (`lib/repositories/*`), garanta que a operação já existe e é testada — a tool nunca deve conter lógica de negócio nova, só orquestrar chamadas a repositórios/engines existentes.
2. Criar/editar o agente em `lib/ai/agents/<dominio>/`: `inputSchema` (Zod `.strict()`), `execute` (ou builder de `ProposedAction` se for write confirmável) — já devolvendo o payload MINIMIZADO (nunca o repository object inteiro; nunca campos que a pergunta-tipo daquela tool não precisa) e com qualquer texto livre de paciente já sanitizado —, e — se a tool precisa de contexto textual no prompt — um `buildXContext()`.
3. Registrar em `lib/ai/tools/registry.ts` via `defineTool({ name, description, inputSchema, risk, profiles, contextRequirement, domain, entityTypes, dataSensitivity, execute })`.
4. Se for write `sensitive`/`clinical`: adicionar um builder em `lib/ai/tools/proposal-builders.ts`, um `kind` novo em `lib/ai/schemas/action.schema.ts`, e um handler de execução em `lib/ai/core/proposal-handlers.ts` que **revalida tudo de novo** no momento da confirmação (ownership, conflito, versão) — nunca confia no que foi calculado na hora da proposta.
5. Adicionar o nome da tool à lista de tools ativas do orquestrador certo (`activeToolNames` em `ai-orchestrator.ts` ou `PATIENT_TOOL_NAMES` em `patient-orchestrator.ts`), na condição de contexto correta.
6. Se a tool lida com dado clínico ou texto de origem paciente/formulário, aplicar `sanitizeClinicalContext`/`wrapUntrustedData`/`redactPii` de `lib/ai/privacy/` antes de o texto entrar no prompt.
7. Testes: schema (`inputSchema.safeParse` rejeita entrada malformada/campos extras), risco/confirmação (`ai-tool-registry.test.ts` ou arquivo próprio do domínio), e — se for write — o ciclo completo propor→confirmar→executar com um caso de conflito (versão desatualizada, recurso já não existe, duplicata).
8. Rodar `tests/ai-capability-manifest.test.ts` (ou adicionar um caso lá) para confirmar que a tool nova aparece no domínio certo e que `requiresConfirmation`/`autoExecutes` bateram com o risco declarado.

## O que NÃO fazer

- Não colocar lógica de decisão (`if (message.includes("arroz"))`) em nenhum agente — a decisão de qual tool chamar é sempre do LLM sobre a lista de tools oferecidas; o código só filtra *quais* tools oferecer por contexto/perfil.
- Não deixar uma tool `clinical` com `execute` que grava direto no banco — o guard `assertNeverAutoAppliesClinical()` existe para lançar em produção se isso acontecer, mas o objetivo é nunca chegar perto disso em code review.
- Não duplicar a lista de capacidades em um documento separado mantido à mão — se uma capacidade não está no `registry`, ela não existe para o assistente; o capability manifest é gerado do registry, não editado à parte.
- Não expor ao paciente uma tool cujo `execute` aceite `clientId`/`patientId` vindo do modelo — dados do próprio paciente sempre vêm do `resolvePatientTools()` vinculado à sessão.
- Não devolver o repository object inteiro como resultado de uma tool "porque é mais rápido" — sempre selecione os campos que a pergunta-tipo daquela tool precisa (minimização, FASE 2A). Se não tem certeza se um campo é necessário, comece sem ele.
- Não logar `input`/`output` inteiros de uma tool call em `console.log`/`logger` direto — `buildToolSet`/`resolvePatientTools` já envolvem todo `execute` com `withToolCallObservability` (`lib/ai/tools/tool-call-observability.ts`), que loga só metadata segura (tool/domínio/sucesso/duração/ids conhecidos). Não adicione um log paralelo dentro do `execute` da tool com o payload cru.

## Domínios sem cobertura hoje

`finance` (só leitura agregada), `dashboard` (idem, sem tools nomeadas de
detalhe), `document`, `configuration`, `admin` — ver
`docs/AI-OPERATOR-AUDIT-ROADMAP.md` para o roadmap de fases que fecha essas
lacunas.
