# Patient Record UX Restructure - Current State Audit

Data: 2026-08-23

Escopo desta rodada: auditoria funcional e arquitetural do prontuario atual. Nenhum redesign foi implementado nesta fase.

## Benchmark publico consultado

- Nutrium Professionals: https://nutrium.com/en/professionals
  - Principios observados: software all-in-one para nutricionistas, cuidado centrado no cliente, gestao de consultas, perfis clinicos, historico/progresso, agenda, pagamentos, app do cliente, templates e resumos com IA como apoio.
- Nutrium Step-by-step guide: https://nutrium.com/blog/nutrium-step-by-step-guide/
  - Principios observados: fluxo guiado para registrar informacoes do cliente e conduzir tarefas clinicas dentro do software.
- Nutrium meal plan templates: https://nutrium.com/blog/new-meal-plan-templates-in-nutrium-for-your-nutrition-appointments/
  - Principios observados: templates reduzem trabalho repetitivo e devem ser ajustaveis ao paciente.
- Nutrium meal plan sections/navigation: https://nutrium.com/blog/nutrium-meal-plans-with-new-sections-and-easier-navigation-of-foods/
  - Principios observados: organizacao por secoes e navegacao previsivel melhora velocidade de prescricao.
- Dietbox pagina publica: https://dietbox.me/pt-BR
  - Principios observados: software online para atendimento/acompanhamento nutricional e gestao do consultorio; menciona uso pratico para avaliacao antropometrica, diario alimentar e planos quantitativos.

Nao foi copiado layout, texto proprietario, codigo, asset ou identidade visual.

## Mapa executivo

O prontuario atual esta concentrado em `app/dashboard/clients/[id]/ClientWorkspace.tsx`, um client component com mais de 2.000 linhas que mistura navegacao, resumo, anamnese, antropometria, plano alimentar, protocolos, tarefas, agenda, financeiro, portal, relatorios, chamadas de API e calculos clinicos. Existe uma rota dedicada de consulta em `app/dashboard/clients/[id]/consulta/page.tsx` que renderiza `components/consultation/ConsultationWorkspace.tsx`; este workspace ja cobre parte importante da visao desejada e deve ser consolidado, nao recriado.

O backend ja possui um `loadClientSnapshot` em `lib/clinical/client-snapshot.ts`, que carrega um snapshot leve via `d1Batch` para a primeira renderizacao da ficha. Esse arquivo e a melhor base para um futuro `PatientRecordSummaryViewModel`, mas ainda nao cobre todas as necessidades do resumo longitudinal.

## Modulos auditados

| MODULE | PAGE/COMPONENT | DATA SOURCE | MAIN ACTIONS | CURRENT UX | DUPLICATION | PROBLEMS | DECISION |
|---|---|---|---|---|---|---|---|
| Pagina do paciente | `app/dashboard/clients/[id]/page.tsx`, `ClientWorkspace.tsx` | `loadClientSnapshot`, APIs lazy | abrir ficha, navegar tabs, editar cadastro, iniciar consulta, excluir | pagina unica com tabs e muitas subsecoes | alta: tipos, formatters, formularios e cards vivem no mesmo arquivo | componente muito grande, logica clinica na UI, abas escondem estado atual | RESTRUCTURE |
| Header/identidade | `ClientWorkspace.tsx` | `initialData.client`, `clinicalSummary` | editar dados, iniciar consulta, abrir print, portal | header contem identidade e varias acoes | parcialmente duplicado com `ConsultationHeader` | nao e persistente entre secoes; mistura contexto clinico e administracao | RESTRUCTURE |
| Resumo | `ClientWorkspace.tsx` | `ClientSnapshot` | ver dados gerais, portal, pendencias | resumo existe, mas compete com muitos blocos | snapshot tambem usado por outras areas parcialmente | nao responde claramente "estado atual"; nao mostra ultima consulta nem timeline composta | RESTRUCTURE |
| Anamnese | `NutritionRecordEditor` dentro de `ClientWorkspace.tsx` | `/api/admin/clients/[id]/nutrition-record`, `nutrition_records` | editar campos, salvar, ver historico, sugerir restricoes | formulario longo por secoes | `ConsultationRecordSummary` mostra subconjunto | leitura ainda e proxima de formulario; edicao nao e por secao isolada | RESTRUCTURE |
| Historico da anamnese | `NutritionRecordHistory` | `/nutrition-record/versions`, `nutrition_record_versions` | ver versoes | existe versionamento canonico | sem duplicacao relevante | precisa virar apoio discreto, nao audit log tecnico | KEEP |
| Restricoes estruturadas | `StructuredRestrictionsPanel` dentro de `ClientWorkspace.tsx` | `/nutrition-record/structured-restrictions`, `patient_clinical_markers` | listar, criar, resolver, aceitar sugestoes | painel funcional | usa tambem meal plan/substitution safety | bom dado para alertas, mas fica enterrado | CONSOLIDATE |
| Antropometria | `ClientWorkspace.tsx`, `ClinicalEvolutionForm`, `EvolutionChart`, `ConsultationAnthropometry` | `/evolutions`, `/clinical-growth`, `client_evolutions` | nova evolucao, graficos, historico, calculos OMS/IOM/bariatrico | funcional e relativamente rico | `ConsultationAnthropometry` duplica resumo/comparacao | dados longitudinais e notas clinicas compartilham tabela; lista completa aparece dentro da tab | RESTRUCTURE |
| Evolucao clinica | `ClientWorkspace.tsx`, `ConsultationEvolution` | `/evolutions`, `client_evolutions` | registrar sintomas, adesao, conduta, metas | misturada com antropometria e timeline | semantica sobreposta a consulta | precisa distinguir consulta, evolucao e medida corporal | RESTRUCTURE |
| Timeline | `ClientWorkspace.tsx`, `lib/repositories/client-timeline.ts` | `/timeline`, `client_timeline_events` | listar eventos | existe timeline simples | evento tecnico e clinico se misturam por convencao | hoje depende de eventos inseridos manualmente; limite 500; nao compoe eventos ausentes de outras tabelas | RESTRUCTURE |
| Consulta workspace | `/dashboard/clients/[id]/consulta`, `ConsultationWorkspace` | `/consultation`, `/nutrition-record`, `/clinical-growth`, `/consultation-sessions/*` | iniciar, preparar brief, anotar, antropometria, plano, protocolo, exames, finalizar | ja segue o principio workspace | componentes reaproveitam partes da ficha e tambem tem resumo proprio | falta lista de consultas historicas na ficha; GET por cliente nao valida existencia do client; autosave sem estado de erro robusto | CONSOLIDATE |
| Briefing/preparar consulta | `ConsultationBrief`, `/consultation-sessions/[id]/brief` | `buildConsultationSystemData`, IA opcional | gerar resumo deterministico + IA opcional | alinhado ao principio de IA opcional | paralelo a possivel futuro summary | precisa estar acessivel tambem no resumo do paciente | KEEP/CONSOLIDATE |
| Plano alimentar | `MealPlanEditor`, `ConsultationMealPlan` | `/meal-plans`, `meal_plans`, `meal_plan_versions`, `meal-plan-view-model` | criar, editar, publicar, print/portal | modulo esta em estabilizacao separada | embutido inteiro na consulta | resumo do prontuario deve mostrar ativo/draft sem renderizar editor completo | CONSOLIDATE |
| Protocolos/suplementos | `ClientWorkspace`, `ConsultationProtocol`, `components/protocols` | `/protocols`, `client_protocols`, `protocols`, `diet_template_supplements` | aplicar protocolo, criar copia, tarefas | dentro de "plano alimentar" via subview | protocolo e suplementacao aparecem juntos por seed/templates | deveria ser secao propria ou "Mais"; resumo so ativos | CONSOLIDATE |
| Exames | `ConsultationExams`, campo `nutrition_records.exams` | `nutrition_records.exams` | ler exames e pedir resumo ao copiloto | texto livre, sem tabela de exames | tambem no print | nao ha entidade de exames/documentos, data, arquivo ou versionamento proprio | KEEP AS TEXT / FUTURE |
| Documentos | print e `document-agent` | paginas imprimiveis, source submission | abrir ficha/print/pre-consulta | nao ha modulo persistido de documentos | IA expõe links de documentos reais | pedido de "Documentos recentes" exige nova entidade futura, mas nao essencial para P1 | FUTURE |
| Agenda | `ClientWorkspace` subview agenda, `appointments` | `/api/admin/appointments?clientId=` | listar proximas, abrir agenda | dentro de "Evolucao" | agenda global e ficha | proxima consulta ja no snapshot; calendario completo nao deve entrar no core clinico | CONSOLIDATE |
| Financeiro | `ClientWorkspace` subview financeiro, `payments` | `/api/admin/payments?clientId=` | listar cobrancas, abrir financeiro | dentro de "Evolucao" | financeiro global e ficha | mistura administrativo com clinico na tab principal | MOVE TO MORE |
| Portal | resumo/portal access, `app/portal` | `client_portal_access`, active meal plan | ativar/copiar acesso, portal paciente | operacional | portal status no snapshot | deve permanecer discreto no prontuario, nao competir com dados clinicos | CONSOLIDATE |
| IA/assistente | `AiChatWidget`, `ConsultationCopilot`, agents | proposal tools, audit/proposal tables | responder, propor, confirmar | IA ja exige proposal/review/confirm em pontos criticos | dois chats: geral e consulta | precisa manter papel opcional; nao deve escrever direto | KEEP |
| Historico/audit | `client_timeline_events`, `nutrition_record_versions`, audit log | tabelas separadas | rastrear evento clinico e auditoria | existem camadas distintas | risco de confundir timeline e audit | timeline clinica deve virar adapter; audit tecnico fora da ficha | CONSOLIDATE |
| APIs | `app/api/admin/clients/[id]/*`, `consultation-sessions/*` | repositories | CRUD por paciente | boa cobertura funcional | padroes variam | nem todos endpoints revalidam `getClientById` no GET; ownership e single-admin, sem tenant_id | HARDEN |
| Schemas | `db/*.sql` | Cloudflare D1/SQLite | persistencia | tabelas abrangentes | dados clinicos permanentes e longitudinais parcialmente misturados | sem tabela de documentos/exames estruturados; sem `consultation_id` em `client_evolutions` | KEEP, avoid migration until needed |

## Arquitetura atual

### Rotas principais

- `/dashboard/clients` lista pacientes.
- `/dashboard/clients/[id]` abre o prontuario/ficha atual.
- `/dashboard/clients/[id]/consulta` abre o Modo Consulta.
- `/dashboard/clients/[id]/print` gera relatorio imprimivel.
- APIs do prontuario vivem majoritariamente em `/api/admin/clients/[id]/*`.
- APIs de sessao de consulta vivem em `/api/admin/consultation-sessions/[id]/*`.

### Repositories principais

- `lib/repositories/clients.ts`: CRUD de clientes e delete em cascata manual.
- `lib/clinical/client-snapshot.ts`: snapshot inicial leve para a ficha.
- `lib/repositories/nutrition-records.ts`: anamnese/prontuario nutricional, cifrado e versionado.
- `lib/repositories/nutrition-record-versions.ts`: historico de snapshots da anamnese.
- `lib/repositories/client-evolutions.ts`: medidas, evolucao clinica e notas longitudinais, cifradas.
- `lib/repositories/client-timeline.ts`: eventos manuais da timeline.
- `lib/repositories/consultation-sessions.ts`: sessao de consulta, notas, brief e finalizacao.
- `lib/repositories/meal-plans.ts`, `meal-plan-view-model.ts`, `meal-plan-publication.ts`: plano alimentar.
- `lib/repositories/client-protocols.ts`, `protocols.ts`, `client-tasks.ts`: protocolos e tarefas.
- `lib/repositories/appointments.ts`, `payments.ts`, `client-portal.ts`: agenda, financeiro e portal.

## Problemas funcionais/UX encontrados

1. O prontuario nao tem uma pagina inicial clinica clara. Ha dados importantes, mas dispersos em tabs e subviews.
2. O estado atual do paciente nao e sintetizado em um contrato unico. `ClientSnapshot` cobre parte, mas a UI ainda calcula e combina informacoes.
3. `ClientWorkspace.tsx` concentra responsabilidades demais: tipos, loaders, formularios, renderizacao, acoes, delete, portal e modulos clinicos.
4. A navegacao principal tem poucas tabs, mas a tab "Evolucao" abriga timeline, agenda, tarefas, financeiro e relatorios; isso cria duplicidade semantica.
5. Antropometria e evolucao clinica compartilham `client_evolutions`; o usuario pode entender medida corporal e registro clinico como a mesma coisa.
6. A timeline atual e apenas uma tabela de eventos inseridos por pontos especificos do sistema; nao e um adapter clinico completo sobre consultas, medidas, plano ativo e documentos.
7. O resumo mostra alguns contadores e estados, mas nao distingue claramente pendencia clinica, administrativa e portal.
8. Anamnese ainda e editada como formulario longo. O historico existe, mas a leitura por secoes precisa virar o estado padrao.
9. Consulta workspace ja existe e e valioso, mas ainda e uma experiencia paralela ao prontuario. O inicio/retorno de consulta deve ficar integrado ao resumo.
10. Documentos/exames estruturados nao existem como modulo persistido. Exames sao texto livre dentro de `nutrition_records.exams`; documentos reais sao paginas de print/pre-consulta e anexos transitivos da IA.
11. Seguranca: endpoints admin exigem sessao, mas o modelo atual nao tem `owner_admin_id`/tenant em `clients`; em uma futura multi-conta, `clientId` por URL nao basta.
12. Performance: o snapshot inicial e bom, mas as secoes fazem muitos fetches independentes. A futura overview precisa continuar agregada/limitada e detalhes devem ser lazy.

## O que manter

- `loadClientSnapshot` como base do futuro resumo.
- `ConsultationWorkspace` como base do workspace de consulta.
- `nutrition_records` + `nutrition_record_versions` como contrato canonico da anamnese.
- `client_evolutions` como fonte longitudinal atual, enquanto nao houver necessidade estrutural de nova tabela.
- `MealPlanEditor` e contratos R1-R7 do plano alimentar, sem redesign nesta frente.
- `client_timeline_events` como uma das fontes da timeline, mas nao a unica.
- IA por proposta/revisao/confirmacao, sem escrita direta.

## O que consolidar

- Header clinico do prontuario e `ConsultationHeader` devem compartilhar um contrato de identidade/alertas.
- Resumo do paciente deve ser montado por ViewModel de repository/service, nao por calculo em componente.
- Timeline deve adaptar eventos de tabelas reais e eventos explicitos.
- Agenda/financeiro/portal devem ser secundarios no prontuario clinico.
- Protocolo/suplementacao devem aparecer como "ativos" no resumo e detalhes em secao propria ou "Mais".

## Riscos para as proximas fases

- Migracao prematura pode criar duplicacao clinica desnecessaria. A primeira implementacao deve usar adapters.
- Alterar `ClientWorkspace` de uma vez e arriscado por tamanho e cobertura visual. Refatorar por fatias.
- Qualquer alteracao em `MealPlanEditor` precisa rodar regressao R1-R7.
- A timeline clinica precisa diferenciar claramente evento clinico de audit log tecnico.
- O workspace de consulta usa autosave debounce; precisa melhorar estado de erro antes de prometer "nao perder notas".

## Conclusao

PATIENT_RECORD_AUDIT_COMPLETE: sim

Implementacao ainda nao iniciada por regra do pedido. O proximo passo permitido e criar o contrato alvo e executar P1 em fatia pequena: shell/header/resumo usando ViewModel.
