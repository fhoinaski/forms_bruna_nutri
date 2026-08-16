# Auditoria arquitetural do assistente de IA + Roadmap para "Operador Interno"

Data: 2026-08-16. Escopo: `lib/ai/*`, `app/api/admin/ai/*`, `app/api/portal/ai/*`, `lib/repositories/*` (read-only, sem alterações de código).

Objetivo final declarado: transformar o assistente atual (dois orquestradores independentes com tool-calling do LLM) em um **operador interno** — orchestrator central + subagentes por domínio + tool registry com risco/permissão granular + resolução de entidades + contexto conversacional + confirmação para writes sensíveis + auditoria — cobrindo todo o CRM (pacientes, agenda, plano alimentar, alimentos, clínico, financeiro, solicitações, dashboard, documentos, configuração, admin).

---

## 1. Estado atual (o que já existe)

O sistema **não é um chatbot solto** — já tem boa parte da espinha dorsal que o objetivo pede, só que organizada de outro jeito:

- **Gateway único de IA**: `lib/ai/gateway/ai-gateway.ts`.
- **Dois orquestradores paralelos** (não um central): `lib/ai/core/ai-orchestrator.ts` (admin, `runAssistantTurn`) e `lib/ai/core/patient-orchestrator.ts` (paciente, `runPatientAssistantTurn`). Cada um roda **uma única chamada** `generateText` com tool-calling nativo do AI SDK (`stopWhen`: até 6 steps admin / 5 paciente, limite de repetição por tool, timeout 30s/20s). A "orquestração para subagentes" hoje é o próprio LLM escolhendo entre tools pré-filtradas pelo código conforme o contexto disponível (há `client`? há `submission`? está em Modo Consulta?) — não há um dispatcher que decida "isto é domínio X, delego ao subagente X".
- **Tool registry central**: `lib/ai/tools/registry.ts`, formato `{name, description, inputSchema (Zod), risk, profiles, contextRequirement, execute}`. 39 tools registradas via `defineTool()` manual (26 admin, 10 paciente — algumas compartilhadas). **Sem auto-discovery** — cada tool é uma chamada explícita no arquivo.
- **Risk taxonomy**: 4 níveis (`read | low | sensitive | clinical`, `lib/ai/policies/action-policy.ts`), não os 6 do objetivo. `requiresConfirmation()` decide, de forma hardcoded (não no prompt), o que precisa de proposta+confirmação. Um guard runtime (`assertNeverAutoAppliesClinical`) impede fisicamente que uma tool `clinical` seja aplicada sem confirmação.
- **Sistema de proposals maduro**: `ai_action_proposals`/`ai_proposal_executions`, TTL 15 min, claim atômico (`pending→executing`, anti-replay), 14 `kind`s de proposta, cada handler **revalida tudo de novo** na confirmação (ownership, conflito de horário, `version` otimista, dedup). Isso já cobre boa parte dos itens 11/12/34 do pedido (confirmação, clinical write com guardrails, audit).
- **Agentes por domínio já existem**, organizados em `lib/ai/agents/{navigation,appointments,clients,clinical,nutrition,content,system,patient}/` — cobrindo parcialmente: paciente, agenda, plano alimentar/alimentos (TACO), clínico, solicitações, e leitura agregada de dashboard/financeiro dentro de `system-overview-agent.ts`.
- **Contexto de UI real**: `lib/ai/context/assistant-page-context.tsx` deriva `currentPage`+ids do `pathname` e o widget de chat envia isso ao backend a cada turno — já é o "UI context aware" do item 26/27.
- **Ações estruturadas de navegação já existem**: `navigation?: {path, clientName}` via destino de enum fechado (nunca URL livre) — já satisfaz os itens 28/29 (whitelist, sem JS arbitrário).
- **Privacidade**: `sanitize-context.ts` (redactPii/wrapUntrustedData/sanitizeClinicalContext) usado em 14 arquivos. O gap de `diet-review-agent.ts`/`patient-orchestrator.ts` citado em auditoria anterior (2026-08-11) **já foi corrigido**, mas os dois módulos usam padrões diferentes de sanitização (um usa `wrapUntrustedData`, outro `redactPii` puro) — inconsistência, não ausência.
- **Testes**: 37 arquivos cobrindo risk policy, PII, prompt injection, ciclo de vida de proposals (incluindo race conditions e crash recovery), memória, fluxos multi-step. Boa base para os itens 38-43 do pedido.
- **Documentação existente desatualizada**: `docs/AI-ARCHITECTURE.md` descreve um estado anterior (ex.: diz que o paciente não tem tools ainda, quando há 10 registradas e um orquestrador inteiro funcionando).

## 2. Gaps reais vs. o objetivo

| # | Gap | Detalhe |
|---|---|---|
| 1 | Sem orchestrator central único | Dois orquestradores paralelos sem hierarquia comum; "subagente" hoje é conjunto de tools + prompt concatenado, não um módulo despachado |
| 2 | Domínios sem agente/tools dedicados | **Financeiro** (só leitura agregada em `getSystemOverview`, zero tool de detalhe/escrita), **Dashboard** (idem, sem agente próprio), **Documentos** (nada), **Configuração** (nada, `ai_settings` não é editável via chat), **Admin/gestão de usuários** (nada) |
| 3 | Tools de escrita faltando | Financeiro (registrar pagamento), clinical markers (`patient-clinical-markers.ts` sem tool), configuração, documentos |
| 4 | Sem capability manifest machine-readable | Fonte de verdade espalhada entre `registry.ts` e blocos de texto de instrução concatenados manualmente em cada orquestrador |
| 5 | Doc desatualizada | `docs/AI-ARCHITECTURE.md` não reflete o estado real; não existe `docs/AI-SYSTEM-INTEGRATION.md` |
| 6 | Context builders informais | Cada agente tem seu `buildXContext()` próprio, sem contrato/interface comum nem registro central (ao contrário do tool registry) |
| 7 | Sem auto-discovery | Tudo allowlist manual — tanto o registry quanto a lista de tools ativas por turno no orquestrador |
| 8 | Resolução de entidades parcial | Só existe para "cliente por nome" (`findClient` + desambiguação); não há resolvedor genérico para plano/consulta/alimento por referência natural |
| 9 | Risk taxonomy mais simples | 4 níveis vs. 6 pedidos; sem distinção READ_SAFE/READ_SENSITIVE; ADMIN_ONLY não existe como categoria de risco (é coberto por `profiles`, mecanismo diferente) |
| 10 | Audit log genérico | Loga `ai_gateway_call` (provider/modelo/duração/tokens), não por capability/domínio de forma estruturada além do campo `agent` |

## 3. Decisão arquitetural recomendada

**Não jogar fora o que existe.** A base (gateway, registry, proposals, privacy, page-context) é sólida e testada — reescrever do zero seria regressão de risco alto sem ganho proporcional. A refatoração deve ser **evolutiva**:

1. Enriquecer a taxonomia de risco de 4→6 categorias (mapeamento: `read`→READ_SAFE/READ_SENSITIVE conforme dado, `low`→WRITE_LOW_RISK, `sensitive`→WRITE_CONFIRMATION_REQUIRED, `clinical`→CLINICAL_WRITE, `profiles`+role admin→ADMIN_ONLY).
2. Formalizar um **capability manifest** derivado do registry existente (não substituí-lo) — cada `defineTool()` ganha metadata extra (`domain`, `entityTypes`) e um script/módulo gera o manifest a partir disso, eliminando duplicação entre código e documentação.
3. Introduzir um **orchestrator central leve** que hoje faz o papel dos dois orquestradores paralelos: mantém `ai-orchestrator.ts`/`patient-orchestrator.ts` como *entry points* (admin vs. paciente continuam precisando de perfis de permissão diferentes por natureza), mas fatora a lógica comum de resolução de contexto/tools/proposals para um núcleo compartilhado — reduzindo duplicação sem forçar um único ponto de entrada artificial entre dois públicos com permissões fundamentalmente diferentes.
4. Preencher os domínios ausentes (financeiro, dashboard, documentos, configuração, admin) como **agentes novos**, seguindo o padrão já estabelecido em `lib/ai/agents/*`.
5. Documentar o padrão de "como adicionar uma feature nova" (`docs/AI-SYSTEM-INTEGRATION.md`) e atualizar `docs/AI-ARCHITECTURE.md`.

## 4. Roadmap de fases

Cada fase entrega tools + testes + doc; nenhuma fase depende de reescrever a anterior.

- **Fase 0 — Fundação (baixo risco, habilita o resto)**
  Formalizar `domain`/`entityTypes` em `defineTool()`; gerar capability manifest a partir do registry; atualizar `docs/AI-ARCHITECTURE.md`; criar `docs/AI-SYSTEM-INTEGRATION.md` com o padrão de integração de nova feature.

- **Fase 1 — Núcleo operacional read-only: food/patient/meal_plan/nutrition_analysis (concluída em 2026-08-16)**
  Reprioridade pelo usuário: resolver primeiro o bug real de "quantas calorias tem 100g de arroz? → não tenho como consultar" antes de financeiro/dashboard. Ver seção "Fase 1 — relatório" abaixo para tools adicionadas, testes e gates.

- **Fase 1b — Appointments/Dashboard/Requests/Finance (read-only, concluída em 2026-08-16)**
  Reprioridade do usuário: agenda, dashboard, solicitações e financeiro, tudo somente leitura, antes de qualquer write. Ver seção "Fase 1B — relatório" abaixo.

- **Fase 2 — Dashboard e Solicitações (read, completar)** *(maior parte já coberta pela Fase 1B — ver relatório)*

- **Fase 3 — Clinical markers (read + write com guardrails)**
  Expor `patient-clinical-markers.ts` como tool READ_SENSITIVE; write como CLINICAL_WRITE via proposal (reaproveitando o sistema existente).

- **Fase 4 — Análise nutricional como domínio próprio**
  Extrair `getMealPlanNutrition`/`findFoodEquivalents` de dentro de `meal-plan-change-agent.ts` para um agente `nutrition-analysis` nomeado, com tools de comparação/cálculo reutilizáveis fora do contexto de edição de plano.

- **Fase 5 — Documentos**
  Novo domínio; escopo depende de o CRM já ter armazenamento de documento por paciente ou não (a auditar antes de iniciar — não confirmado nesta rodada).

- **Fase 6 — Configuração e Admin**
  Tools ADMIN_ONLY para `ai_settings` e afins; exige autenticação/role check reforçado, maior risco — última fase.

- **Transversal, entra em qualquer fase que a toque**: unificar o padrão de sanitização (`wrapUntrustedData` vs. `redactPii` puro) para todos os agentes clínicos/paciente usarem `sanitizeClinicalContext` de forma consistente.

## Fase 1 — relatório

### Tools adicionadas

**Catálogo de alimentos** (`lib/ai/agents/food/food-catalog-agent.ts`), sempre ativas, nunca dependem de cliente/formulário em contexto:
- `searchFoods` — busca unificada TACO/TBCA + alimentos personalizados (`lib/nutrition/food-search.ts`, motor já existente).
- `getFoodDetails` — tabela nutricional completa por 100g (`lib/nutrition/nutrients.ts#getFoodNutrientsFromReference`).
- `getFoodPortions` — medidas caseiras cadastradas (`lib/repositories/food-portions.ts`).
- `calculateFoodNutrients` — nutrientes de uma quantidade/medida específica (`lib/nutrition/nutrients.ts#calculateItemNutrients`), a mesma engine que já calcula os totais de plano alimentar.

**Leitura de paciente por id** (`lib/ai/agents/clients/patient-lookup-agent.ts`), encadeável com `findClient` no mesmo turno, sem depender de cliente pré-selecionado na tela:
- `getPatientSummary` — plano ativo, nº de protocolos, tarefas pendentes, próxima/última consulta.
- `getPatientActivePlan` — plano alimentar ativo completo (refeições/itens/metas, com ids reais para encadear).
- `getPatientClinicalMarkers` — alergias/intolerâncias/restrições/sinalizações clínicas cadastradas (nunca `evidence_text` bruto — reduz superfície de prompt injection).

**Reaproveitada, não duplicada**: `getMealPlanNutrition` (já existia) teve `contextRequirement` corrigido de `"client"` para `"none"` e passou a ficar sempre ativa — como já recebia `mealPlanId` como parâmetro, só precisava deixar de estar condicionada a cliente pré-selecionado.

**Decisão consciente de não duplicar**: `findClient` já cobre `search_patients`; `searchMealPlanFoods`/`findFoodEquivalents` continuam existindo à parte (contexto de edição de plano, cliente obrigatório) — não foram substituídas pela nova `searchFoods` para não alterar o fluxo de proposta de alteração de plano já testado.

### Domínios cobertos

`food` (zero → 4 tools), `patient` (reforçado com leitura encadeável por id), `meal_plan` (reforçado), `nutrition_analysis` (reforçado — `getMealPlanNutrition` agora sempre alcançável), `clinical` (reforçado com `getPatientClinicalMarkers`, gap fechado). `finance`/`document`/`configuration`/`admin` seguem sem nenhuma tool (adiados para Fase 1b+).

### Perguntas testadas (unitário, execute() real contra dado real da TACO)

"quantas calorias tem 100g de arroz" (`calculateFoodNutrients` com `Arroz, tipo 1, cozido`, 128 kcal), busca ambígua "arroz" (múltiplos candidatos, nunca escolhido sozinho pelo código — a transparência/pergunta fica a cargo do prompt), alimento inexistente (`found:false`, nunca inventado), unidade genérica sem medida cadastrada (`confidence:"low"` + warning explícito), medida caseira específica via `portionId` (`confidence:"high"`), `portionId` de outro alimento é ignorado (nunca aplica identidade errada), fonte CUSTOM vs MANUFACTURER nunca se confundem.

### Ambiguidade

Resolvida por instrução de prompt (`FOOD_CATALOG_ASSISTANT_INSTRUCTIONS`), não por lógica hardcoded: candidato dominante → responder de forma transparente qual registro foi usado; ambiguidade real → perguntar. Nenhum "if arroz" no código — mesma garantia já aplicada a `findClient`/desambiguação de cliente.

### Autorização

`getPatientSummary`/`getPatientActivePlan`/`getPatientClinicalMarkers` sempre revalidam a existência do cliente a partir do `clientId` recebido (`getClientById`) antes de ler qualquer dado relacionado — id inexistente ou inválido devolve `found:false`, nunca um erro que vaze detalhe interno. Testado em `tests/ai-patient-lookup.test.ts`.

### Multi-turn e page context

Não alterados nesta fase — já funcionam pelo mecanismo existente (`lib/ai/context/assistant-page-context.tsx` deriva `clientId` da rota a cada mensagem; a navegação real muda a rota). O que esta fase resolve é o caso que NÃO passava por esse mecanismo: perguntar sobre um paciente ou alimento sem nenhum cliente pré-selecionado na tela, no mesmo turno.

### Gates

`tsc --noEmit` limpo, `eslint .` limpo, `npm run build` (Next.js) sem erro, suíte completa de testes: **886/886** (dois arquivos com timeout de 5s sob carga total do runner em paralelo — confirmado flaky, passam isolados; não relacionados a esta mudança). Testes de IA: **409/409**, incluindo 24 novos testes das tools desta fase e 3 testes de wiring confirmando que as tools novas são realmente alcançáveis via `buildToolSet` com o perfil `ADMIN_ASSISTANT` (nunca com `PATIENT_ASSISTANT`).

### Gaps restantes

- **E2E conversacional real não executado**: este ambiente não tem nenhuma chave de provedor de IA configurada (`.env.local` sem `*_API_KEY`), então não foi possível abrir a UI e conversar de verdade com o assistente. A cobertura desta fase é unitária/integração (execute() real dos tools + wiring real do registry/orchestrator), não uma sessão de chat real. Recomendação: testar manualmente em ambiente com credencial configurada antes de considerar a fase 100% validada em produção.
- Financeiro/dashboard/requests nomeados ficam para a Fase 1b/2 (reprioridade explícita do usuário).
- Taxonomia de risco ainda em 4 níveis — as novas tools clínicas de leitura (`getPatientClinicalMarkers`) seguem risco `read` (auto-executa), consistente com o padrão já existente (prontuário já é auto-injetado sem confirmação); a distinção READ_SAFE/READ_SENSITIVE do objetivo final continua pendente (ver gap #9 da auditoria original).

## Fase 1B — relatório

### Tools adicionadas/reutilizadas

**Agenda** (`lib/ai/agents/appointments/appointment-lookup-agent.ts`), sempre ativas:
- `getTodayAppointments` — consultas de um dia (hoje por padrão, ou uma data específica), nunca inclui canceladas.
- `getNextAppointment` — próxima consulta geral ou de um paciente específico (`clientId` opcional).
- `getAppointmentDetails` — detalhe completo de uma consulta por id.
- `getUpcomingAppointments` — consultas nos próximos N dias (padrão 7), geral ou por paciente.
Todas reaproveitam `lib/repositories/appointments.ts` (`getAppointments`/`getAppointmentById`, já existentes) + `lib/utils/timezone.ts` (`getSaoPauloDateKey`/`getSaoPauloDayBoundaries`, já existentes) — nenhuma lógica de data nova.

**Dashboard** (`lib/ai/agents/dashboard/dashboard-agent.ts`), sempre ativas:
- `getDashboardActionItems`, `getUrgentItems` (filtro `priority` URGENT/HIGH), `getRecentActivity` (filtro `section` RECENT). Todas são wrapper fino sobre `lib/dashboard/action-items.ts#getDashboardActionItems` — **nenhum score novo**, só filtros sobre o resultado já pronto, exatamente como pedido.

**Solicitações** (complemento em `lib/ai/agents/clients/patient-requests-agent.ts`), sempre ativas:
- `getPatientRequestDetails` — detalhe de um pedido por id (`lib/repositories/patient-requests.ts#getPatientRequestById`, já existia, sem tool).
- `getPendingAiProposals` — reaproveita o mesmo feed do dashboard (`getDashboardActionItems`), filtrado por tipo `AI_PROPOSAL_PENDING`/`AI_PROPOSAL_REVIEW` — nenhuma query SQL nova.
- **Decisão consciente de não duplicar**: `getPendingPatientRequests` do pedido do usuário mapeia para a tool já existente `getPatientRequests` (ativa desde antes da Fase 1) com `status: "pending_review"` — instruções do prompt atualizadas para deixar isso explícito, em vez de registrar uma tool nova que faria a mesma chamada.

**Financeiro** (`lib/ai/agents/finance/finance-lookup-agent.ts`), sempre ativas, só leitura:
- `getPaymentDetails`, `getOverduePayments` (status `vencido` OU `pendente` com vencimento no passado — mesmo critério já usado em `getUnnotifiedOverduePayments`/`action-items.ts`), `getPendingPayments` (status `pendente`), `getFinancialSummary` (wrapper de `getPaymentMetrics()`, já existente). Adicionado `getPaymentById` a `lib/repositories/payments.ts` (única alteração de repositório desta fase — leitura por id, não existia).

### Domínios cobertos

`appointment` (zero → 4 tools), `dashboard` (zero → 3 tools), `request` (reforçado com 2 tools), `finance` (zero → 4 tools).

### Perguntas testadas (unitário, execute() real com repositórios mockados)

"quais consultas tenho hoje" / data específica, "qual minha próxima consulta" (geral e por paciente), paciente inexistente (`found:false`), detalhe de consulta, consultas dos próximos N dias filtradas por paciente, canceladas sempre excluídas; feed do dashboard completo/urgente/recente; detalhe de solicitação por id, propostas da IA pendentes filtradas do mesmo feed; pagamento por id, vencidos vs. pendentes (incluindo o caso "pendente com vencimento futuro NÃO é vencido"), resumo financeiro com valores formatados.

### Tool chaining

Testado via composição direta das funções `execute()` (mesma limitação de ambiente da Fase 1 — sem LLM real neste ambiente, ver "Gaps restantes"):
- `getNextAppointment()` → `clientId` do resultado alimenta `getPatientSummary(clientId)` diretamente (`tests/ai-appointment-lookup.test.ts`).
- `getOverduePayments()` ∩ `getUpcomingAppointments()` por `clientId` — "quem está devendo e tem consulta essa semana" (`tests/ai-fase1b-wiring.test.ts`).
Instruções de prompt (`APPOINTMENT_LOOKUP_ASSISTANT_INSTRUCTIONS`, `FINANCE_LOOKUP_ASSISTANT_INSTRUCTIONS`) orientam o LLM a resolver `clientId` com `findClient` antes de filtrar por paciente, e a combinar tools de domínios diferentes quando a pergunta pedir (o encadeamento real dentro de um turno continua sendo o tool-calling nativo do AI SDK, não código novo de dispatch).

### Multi-turn e page context

Não alterados nesta fase — mesmo mecanismo já validado nas fases anteriores (`assistant-page-context.tsx` deriva `clientId` da rota a cada mensagem). Se a nutricionista estiver em `/dashboard/agenda` ou `/dashboard/financeiro`, o `currentPage` já chega ao backend; as novas tools desta fase não exigem esse contexto para funcionar (todas `contextRequirement: "none"`), então respondem igual com ou sem ele — o contexto de página apenas evita perguntas redundantes quando já é óbvio de qual domínio se trata (comportamento de prompt, não de código).

### Autorização

Todas revalidam existência do recurso a partir do id recebido antes de responder (`getClientById`/`getAppointmentById`/`getPaymentById`/`getPatientRequestById`) — id inexistente ou inválido devolve `found:false`, nunca vaza erro interno nem dado de outro registro. Nenhuma tool desta fase aceita write; todas `risk: "read"`, perfil `ADMIN_ASSISTANT` apenas (nunca `PATIENT_ASSISTANT` — financeiro e agenda administrativa nunca alcançam o portal do paciente, testado em `tests/ai-fase1b-wiring.test.ts`).

### Domains ainda descobertos

`listUncoveredDomains()` agora devolve `["document", "configuration", "admin"]` — `finance`/`dashboard`/`appointment` saíram da lista nesta fase (testado em `tests/ai-capability-manifest.test.ts`, atualizado).

### Gap de sensibilidade documentado (item 10 do pedido)

`getPatientRequestDetails`/`getPatientRequests` continuam devolvendo `patientText` (texto livre digitado pela paciente) sem `wrapUntrustedData`/`redactPii` — gap pré-existente à Fase 1B (a tool `getPatientRequests` original já tinha esse comportamento), não introduzido nem corrigido agora. Registrado aqui para a futura taxonomia READ_SAFE/READ_SENSITIVE tratar esse caso como leitura sensível com sanitização, e para uma sessão futura considerar aplicar `wrapUntrustedData` a esse campo especificamente.

### Gates

`tsc --noEmit` limpo, `eslint .` limpo, `npm run build` sem erro, suíte **completa** do projeto (não só IA): **918/918**. Testes de IA: **438/438** (29 novos: 5 arquivos de teste — agenda, dashboard, financeiro, solicitações/propostas, wiring cross-domínio).

### Gaps restantes

- Mesmo gap da Fase 1: nenhuma `*_API_KEY` de IA configurada neste ambiente — E2E conversacional real (UI + LLM de verdade) não foi possível, só unitário/integração.
- Write ainda não implementado em nenhum domínio novo (marcar pagamento como pago, criar pagamento, cancelar/reagendar consulta, resolver solicitação, aprovar proposal) — conforme pedido explícito desta fase.
- Taxonomia de risco continua em 4 níveis (`read/low/sensitive/clinical`); dado financeiro e de solicitação de paciente hoje é só `read`, sem distinção READ_SAFE/READ_SENSITIVE — mesma pendência já registrada na Fase 1.
- `document`, `configuration`, `admin` seguem sem nenhuma tool.

## 5. Antes de escolher uma fase

Perguntas em aberto que mudam o escopo de Fase 1/5:
- Financeiro: quais operações de escrita fazem sentido no assistente (registrar pagamento manual é write; não há gateway de pagamento no sistema hoje)?
- Documentos: existe já um módulo de upload/storage de documento por paciente no CRM, ou este domínio nem existe fora do assistente ainda?
