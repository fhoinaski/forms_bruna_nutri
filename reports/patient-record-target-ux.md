# Patient Record UX Restructure - Target UX

Data: 2026-08-23

Objetivo: definir a experiencia alvo antes do redesign, seguindo os principios patient-first, timeline clinica, consulta como workspace, dados longitudinais, navegacao simples e IA opcional.

## Principios de produto

1. Paciente primeiro: abrir a ficha deve responder rapidamente quem e a pessoa, por que esta em acompanhamento, o que mudou recentemente e qual a proxima acao.
2. Clinico antes de administrativo: financeiro, portal e relatorios ficam em "Mais" ou bloco discreto.
3. Overview e leitura; modulo especifico e edicao. A home do prontuario nao deve renderizar formulario gigante nem plano alimentar completo.
4. Timeline clinica nao e audit log. Ela deve contar a historia assistencial em eventos legiveis.
5. Consulta e workspace. Ela resume contexto, registra a consulta atual e abre modulos sem duplicar tudo.
6. IA e assistente opcional. Ela prepara propostas, mas nao inventa dado, nao salva sozinha e nao publica.
7. Nao mostrar zero quando dado nao existe. Usar empty states claros.
8. Mobile e uma coluna; desktop prioriza leitura com area principal e painel lateral leve.

## Arquitetura de navegacao alvo

Rota base: `/dashboard/clients/[id]`

Tabs principais:

- Resumo
- Consultas
- Anamnese
- Antropometria
- Plano alimentar
- Evolucao
- Mais

Dentro de "Mais":

- Protocolos/Suplementacao
- Documentos
- Agenda
- Financeiro
- Portal
- Relatorios
- Historico tecnico quando necessario, fora da timeline clinica

Rotas existentes devem continuar funcionando. Tabs atuais por query string podem ser mantidas temporariamente para compatibilidade.

## Wireframe A - Patient Overview

Desktop:

```
Breadcrumb simples
Pacientes / Maria Silva

Header compacto persistente
Maria Silva
31 anos · acompanhamento ativo
Objetivo principal: Emagrecimento
Ultima consulta: 18/08/2026
Proxima: 02/09/2026
[Iniciar consulta] [Abrir plano] [Mais]

Nav
Resumo | Consultas | Anamnese | Antropometria | Plano alimentar | Evolucao | Mais

Conteudo principal
Estado atual
- Peso atual
- Variacao desde anterior
- IMC atual
- Plano alimentar ativo
- Objetivo principal
- Pendencias clinicas

Desde a ultima consulta
- Peso: -1,3 kg
- Plano: v2 -> v3
- Novas respostas de pre-consulta: 3

Linha do tempo recente
23/08 Plano alimentar v3 publicado
18/08 Consulta de retorno
20/07 Avaliacao antropometrica
16/06 Consulta inicial

Painel direito leve
Alertas clinicos
- Alergia: leite
- Restricao: vegetariana

Acoes rapidas
[Nova avaliacao]
[Preparar consulta]
[Agendar retorno]
```

Estados vazios:

- Sem antropometria: "Nenhuma avaliacao registrada." + "Registrar primeira avaliacao".
- Sem plano ativo: "Nenhum plano alimentar publicado." + "Criar plano".
- Sem timeline: "Nenhum evento clinico registrado ainda."

## Wireframe B - Consultation Workspace

Rota: `/dashboard/clients/[id]/consulta`

```
Header da consulta
Maria Silva · 31 anos
Consulta em andamento · 32 min
Alertas clinicos, se existirem
[Voltar para prontuario] [Finalizar consulta]

Layout desktop
Coluna principal:
  Tabs: Consulta | Antropometria | Evolucao | Plano | Protocolo | Exames

  Consulta atual:
  - Resumo para consulta
  - Anotacoes da consulta
  - Prontuario desta consulta

Painel lateral:
  Copiloto
  - Resumir evolucao desde ultima consulta
  - Organizar notas
  - Identificar dados faltantes
  - Preparar proposta de conduta
```

Regras:

- Ao clicar em "Iniciar consulta", reutilizar sessao `in_progress` se existir.
- Mostrar "Salvando...", "Salvo" e erro de salvamento em notas.
- Finalizacao: salvar/revisar/finalizar; checklist pode ser leve, mas nao deve mascarar estado nao salvo.
- Consulta concluida deve aparecer na timeline.

## Wireframe C - Anamnese

Estado de leitura:

```
Anamnese
[Editar secao] [Historico]

Objetivo
- Queixa principal
- Objetivos
- Meta de peso/conduta

Historico de saude
- Diagnosticos
- Medicamentos
- Suplementos
- Alertas de risco

Sono e rotina
- Sono
- Estresse
- Atividade fisica
- Hidratacao

Rotina alimentar
- Alimentacao atual
- Preferencias
- Aversoes
- Restricoes

Exames e observacoes
- Exames
- Avaliacao
- Plano de cuidado
```

Edicao:

- Abrir somente a secao selecionada.
- Preservar `expectedVersion`.
- Mostrar conflito de versao com mensagem profissional.
- Historico deve continuar usando `nutrition_record_versions`.

## Wireframe D - Anthropometry

```
Antropometria
[Nova avaliacao]

Topo:
Peso atual
IMC atual
Variacao vs anterior
% gordura, se existir

Comparacao:
Atual vs anterior
Atual vs primeira avaliacao

Grafico:
Peso e, quando existirem, cintura/% gordura/massa magra

Historico:
Lista de avaliacoes em ordem desc
```

Regras:

- Nao deixar todos os campos sempre em edicao.
- Nao mostrar metricas inexistentes como zero.
- Detalhes pediatricos/gestacionais/bariatricos continuam em area contextual quando aplicaveis.

## Wireframe E - Timeline

```
Timeline clinica

23/08/2026
Plano alimentar v3 publicado
Abrir plano

18/08/2026
Consulta de retorno finalizada
Peso: 68,4 kg
Ver consulta

20/07/2026
Avaliacao antropometrica
Peso: 69,7 kg

16/06/2026
Paciente cadastrado
```

Fontes permitidas:

- `client_timeline_events`
- `consultation_sessions`
- `client_evolutions`
- `meal_plans`/versoes publicadas
- `client_protocols`
- `appointments`
- documentos reais, quando houver entidade futura

Nao incluir:

- stack trace
- audit log tecnico
- ids internos
- eventos inferidos sem fonte real

## Wireframe F - Mobile

```
Header compacto
Maria Silva
31 anos · ativo
[Iniciar consulta]

Resumo
Cards empilhados

Alertas, se existirem

Timeline recente

Nav inferior/segmentada:
Resumo | Consulta | Plano | Mais
```

Regras mobile:

- Uma coluna.
- Botao primario visivel sem ocupar todo o topo.
- Tabelas viram listas ou rolagem horizontal controlada.
- Nenhum texto deve sobrepor botao/card.

## Fases propostas P1-P7

P1 - Patient shell + summary

- Criar `PatientRecordSummaryViewModel` baseado em `loadClientSnapshot`.
- Criar header clinico compacto.
- Reorganizar overview sem mexer no Meal Plan.
- Testes focados de resumo.

P2 - Timeline

- Criar `PatientRecordTimelineEvent` adapter.
- Combinar eventos reais em ordem desc.
- Expor endpoint/resolver limitado para overview.
- Testar ordenacao e ausencia de eventos inventados.

P3 - Consultation workspace

- Consolidar Modo Consulta existente.
- Melhorar estado de salvamento/erro.
- Expor lista de consultas historicas na ficha.
- Garantir timeline apos finalizar.

P4 - Anamnesis UX

- Criar leitura por secoes.
- Editar por secao usando contrato versionado existente.
- Manter historico.
- Testar conflito de versao.

P5 - Anthropometry integration

- Separar UX de medida corporal da evolucao clinica.
- Criar cards de atual/anterior/primeira.
- Manter `ClinicalEvolutionForm` e calculos existentes.
- Testar grafico/dados do paciente correto.

P6 - Meal plan/protocol/document integration

- Resumo do plano ativo/draft sem renderizar editor inteiro.
- Protocolos ativos no resumo.
- Documentos reais: manter links de print/pre-consulta; nao criar tabela sem decisao.
- Agenda/financeiro/portal em "Mais".

P7 - QA

- Fixture `Patient Record UX Test`.
- Golden overview, timeline, consultation workspace, anamnese, antropometria e plano.
- Screenshots desktop/mobile.
- Regressao Meal Plan R1-R7 se houver componente compartilhado.

## Definicao de ready alvo

PATIENT_OVERVIEW_READY exige:

- Header compacto com identidade, idade, status, objetivo, ultima/proxima consulta quando existirem.
- Cards sem zeros falsos.
- Plano ativo e draft como estados separados.
- Alertas clinicos baseados em dados estruturados/textos existentes.
- Timeline recente limitada e legivel.

PATIENT_RECORD_RESTRUCTURE_READY exige todos os gates do pedido, incluindo seguranca, responsividade, acessibilidade, testes e revisao visual.
