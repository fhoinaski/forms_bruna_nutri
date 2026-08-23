# Auditoria funcional - Prontuario do cliente -> Plano alimentar

Data da auditoria: 2026-08-22
Escopo: diagnostico funcional e arquitetural. Nenhuma mudanca grande implementada.

## 1. Resumo executivo

O modulo de Plano Alimentar esta em estado **PARTIAL**: ja existe uma base funcional robusta para criar plano por modelo, editar refeicoes/alimentos, calcular macros, salvar com versionamento, ativar no portal, imprimir, usar IA como pre-plano e gerar substituicoes. Porem ainda nao esta pronto para o objetivo de produto de consulta rapida em poucos minutos, porque o fluxo de template ainda e simples demais, a UX do editor expõe conceitos concorrentes, e a camada nova de slots/exchange groups ainda nao esta consolidada como biblioteca reutilizavel de equivalentes.

Pontos fortes:

- Criar por modelo clona dados para o paciente; nao edita o template original.
- Planos tem versionamento, `template_id`/`template_version`, snapshot nutricional por item vinculado e optimistic concurrency.
- O calculo nutricional usa engine central, nao valores inventados pela IA.
- IA gera pre-plano/draft e exige aplicacao/salvamento humano.
- Substituicoes e grupos de troca filtram pendencias antes de portal/print.
- Existe CRUD de templates, salvar plano como modelo, duplicar plano/refeicao/item, receitas, portal e impressao.

Principais gaps:

- Templates atuais nao representam um "Adulto saudavel 1800 kcal com 5-6 refeicoes pronto para consulta"; em producao documentada, a maioria dos templates DIETA tem 3 refeicoes.
- Nao ha preview rico de template antes de importar; a tela atual escolhe apenas grupo alvo em um `<select>`.
- Substituicoes aparecem em quatro superficies parcialmente sobrepostas: `Substituir`, `Substituicoes`, `Subst. auto`, `Grupo de troca`.
- `meal_plan_substitutions` e `exchange_groups` sao duas arquiteturas de alternativas em paralelo; portal consome ambas, print consome apenas `meal_plan_substitutions`.
- `diet_template_slots` existe e orienta itens, mas a UI de templates ainda edita a estrutura antiga (`diet_template_items`), podendo apagar slots de uma refeicao via cascade se o template for editado e salvo.
- Nao existe biblioteca reutilizavel de listas de equivalentes por contexto.
- Nao ha filtros de templates por energia, restricao, numero de refeicoes, SYSTEM/USER ou preview nutricional.
- Restricoes do paciente nao sao checadas antes de importar template.

## 2. Evidencia executada

### Testes automatizados

Rodado:

```txt
npm test -- tests/meal-plan-item-substitutions.test.ts tests/food-exchange-groups.test.ts tests/template-slots-migration.test.ts tests/meal-plan-change-substitutions.test.ts tests/meal-plan-substitution-dedupe.test.ts tests/meal-plan-snapshot.test.ts tests/meal-plan-editor-rounding.test.ts
```

Resultado: **7 arquivos / 60 testes passaram**.

Tentei rodar E2E oficial:

```txt
npm run test:e2e -- e2e/meal-plan-substitutions.spec.ts e2e/meal-plan-ux2.spec.ts --project=chromium-desktop
```

Bloqueio: `localhost:3000` ja estava em uso por um processo `node.exe`, e o `playwright.config.ts` tem `reuseExistingServer: false` para evitar rodar contra banco errado.

### Fluxo real em navegador isolado

Subi ambiente E2E isolado em `localhost:3001` com D1 shim local. A primeira tentativa mostrou um problema de setup: migrations sozinhas nao semeiam templates, entao a UI exibiu "Ainda nao existe um modelo cadastrado para este grupo" para Adulto saudavel.

Depois criei um template minimo via API autenticada e executei:

1. Login admin.
2. Criar paciente adulto saudavel.
3. Abrir prontuario.
4. Abrir aba Plano alimentar.
5. Criar por modelo.
6. Revisar refeicoes/macros.
7. Adicionar refeicao manual.
8. Buscar alimento.
9. Definir quantidade.
10. Salvar rascunho.
11. Ativar no portal.

Resultado medido:

- 7 cliques principais do login ate ativar.
- Tempo automatizado: ~7,2s; em uso humano, estimativa de 2-5 minutos se o template ja vier bom, mais tempo se precisar ajustar muitas substituicoes.
- Plano inicial pelo template de teste: 3 refeicoes, 8 itens, 882 kcal.
- Plano final: 4 refeicoes, 9 itens, 1 substituicao, status `active`, versao 3.
- `template_id` e `template_version` foram preservados.

Achado UX no texto da tela: cada item normal exibe muitas acoes antes de qualquer expansao: `Substituir`, `Substituicoes`, `Grupo de troca`, `Subst. auto`, alem de locks, mover, duplicar e excluir. Isso compete visualmente com alimento/quantidade/unidade.

## 3. Arquitetura atual

### Persistencia principal

- `meal_plans`: plano por paciente, status `draft|active|archived`, versao, metas nutricionais, `template_id`, `template_version`.
- `meal_plan_meals` -> `meal_plan_items`: refeicoes e alimentos prescritos.
- `meal_plan_substitutions`: substituicoes planas; evoluiu para aceitar identidade estruturada, score, qualidade e aprovacao.
- `exchange_groups` -> `exchange_group_alternatives`: grupos de troca por alimento principal, com alternativas `SUGGESTED|APPROVED|EDITED|REJECTED`.
- `meal_plan_versions`: snapshots clinicos versionados e criptografados.
- `diet_template_meals` -> `diet_template_items`: template estruturado classico.
- `diet_template_substitutions`, `diet_template_supplements`.
- `diet_template_slots` -> `diet_template_slot_foods`: camada nova de slot por grupo/subgrupo/papel nutricional.

### Frontend principal

- `components/dashboard/MealPlanEditor.tsx`: container de plano, criar por modelo, criar com IA, salvar, ativar, duplicar plano, salvar como modelo, metas, grade semanal.
- `components/dashboard/MealItemsEditor.tsx`: refeicoes, alimentos, busca, quantidades, medidas caseiras, receitas, substituicoes por item, grupos de troca, locks, macros ao vivo.
- `components/dashboard/ItemSubstitutionsPanel.tsx`: equivalentes por item usando `meal_plan_substitutions`.
- `components/dashboard/ExchangeGroupPanel.tsx`: grupos de troca persistidos em `exchange_groups`.
- `components/dashboard/AiMealPlanWizard.tsx`: wizard de pre-plano por IA.
- `components/nutrition/MealPlanNutritionSummary.tsx`: resumo nutricional.

### Rotas principais

- `POST /api/admin/clients/[id]/meal-plans`: cria por modelo.
- `PUT /api/admin/clients/[id]/meal-plans/[planId]`: salva/ativa com versionamento.
- `POST /api/admin/clients/[id]/meal-plans/[planId]/save-as-template`: salva plano como novo template.
- `POST /api/admin/clients/[id]/meal-plans/draft`: cria pre-plano com IA.
- `POST /api/admin/clients/[id]/meal-plans/draft/optimize`: proposta de ajuste de quantidades do draft.
- `POST /api/admin/clients/[id]/meal-plans/[planId]/optimize`: proposta de ajuste de quantidades do plano salvo.
- `POST /api/admin/clients/[id]/meal-plans/substitutions/suggest`: equivalencia deterministica.
- `POST /api/admin/clients/[id]/meal-plans/substitutions/suggest-ai`: IA sugere nomes, engine calcula depois.
- `POST/PATCH /api/admin/clients/[id]/meal-plans/exchange-groups`: grupos de troca.
- `GET /portal` e `GET /api/portal/me`: entrega ao paciente.
- `/dashboard/clients/[id]/print?secao=plano-alimentar`: impressao/PDF via print.

## 4. Fluxo atual real

| Etapa | Status | Observacao |
|---|---:|---|
| Prontuario -> Plano alimentar | IMPLEMENTADO | Aba no workspace do cliente. |
| Criar por modelo | PARCIAL | Cria a partir de `target_group`, sem biblioteca/preview/filtros antes de importar. |
| Criar com IA | IMPLEMENTADO/PARCIAL | Wizard robusto de draft; nao parte de template selecionado. |
| Manual | IMPLEMENTADO | Adicionar refeicao/alimento, buscar, ajustar quantidade/unidade. |
| Refeicoes | IMPLEMENTADO | Duplicar/reordenar/refeicao por receita. |
| Alimentos | IMPLEMENTADO | Busca com fonte estruturada; fallback textual existe. |
| Quantidades | IMPLEMENTADO/PARCIAL | Medidas caseiras e snapshots existem; itens TBCA/IBGE_POF ainda nao calculam no engine. |
| Substituicoes | DUPLICADO/PARCIAL | Ha lista plana e painel por item. |
| Grupos de troca | EXPERIMENTAL/PARCIAL | Motor bom, mas UX e integracao com templates ainda incompletas. |
| Calculo | IMPLEMENTADO/PARCIAL | Centralizado; cobertura de fontes canonicas ainda parcial. |
| Salvar | IMPLEMENTADO | Versionado, concorrencia otimista. |
| Imprimir | IMPLEMENTADO/PARCIAL | Imprime substituicoes planas; nao imprime `exchange_groups`. |
| Portal | IMPLEMENTADO/PARCIAL | Mostra plano, substituicoes aprovadas e exchange groups aprovados, mas UI ainda separa conceitos. |

## 5. Templates atuais

Pelo seed e relatorios de migracao ja existentes:

- Seed define 11 grupos com templates: `ADULTO_SAUDAVEL`, `EMAGRECIMENTO`, `HIPERTROFIA`, `IDOSO`, `GESTANTE`, `CRIANCA`, `TEA`, `SOP`, `VEGETARIANO_ESTRITO`, `ENDURANCE`, `RESISTENCIA_INSULINA`.
- Cada grupo do seed gera 3 templates: `DIETA`, `SUPLEMENTACAO`, `SUBSTITUICAO`.
- Relatorio `reports/fase8-existing-template-migration.md` documenta 45 registros em producao, 12 templates DIETA migrados para slots, 11 legados desativados e 3 grupos sem conteudo (`BARIATRICO`, `RENAL`, `ONCOLOGICO`).
- `SYSTEM` vs `USER` nao existe como campo explicito. Inferencia atual: IDs `tpl-*` sao sistema/seed; UUIDs criados por `saveMealPlanAsDietTemplate` sao usuario, mas isso nao e contrato de banco.
- Templates possuem refeicoes e alimentos quando sao DIETA relacionais.
- Templates possuem substituicoes, mas sao planas por `base_food`/`option_food`, nao penduradas em item/slot.
- Templates possuem slots (`diet_template_slots`) apos migracao, mas a UI de template nao e slot-native.
- Templates nao possuem metas nutricionais formais por energia/macros.
- Templates possuem `version`, `structure_version`, `clinical_risk_level`, `requires_professional_review`.
- Podem ser criados/editados/excluidos pela biblioteca.
- Duplicar template como acao direta nao aparece; salvar plano como modelo existe.
- Arquivar template nao existe como conceito; ha `is_active`.

Resposta direta as perguntas:

| Pergunta | Estado |
|---|---|
| Quantos templates existem? | Seed: 33. Producao documentada: 45 totais; 12 DIETA migrados; 11 legados desativados. |
| Quais ativos? | `getAllTemplates` filtra `is_active=1`; relatorio Fase 8 indica 11 grupos canonicos + 1 personalizado DIETA ativos/migrados. |
| SYSTEM/USER? | Nao implementado como campo. |
| Possuem refeicoes/alimentos? | Sim para DIETA relacional; nao para SUPLEMENTACAO/SUBSTITUICAO. |
| Possuem food slots? | Sim nos migrados v2; nao e editavel nativamente na UI. |
| Possuem foodGroup/nutritionalRole? | Sim via slots e via carimbo em itens criados por template. |
| Possuem substituicoes? | Sim, mas planas. |
| Possuem receitas? | `source_recipe_id` existe em meal de template, mas seed nao usa receitas. |
| Possuem metas nutricionais? | Nao. |
| Possuem versao? | Sim. |
| Podem ser duplicados? | Nao diretamente. |
| Podem ser personalizados? | Sim editando template ou salvando plano como modelo. |
| Podem ser salvos como novo modelo? | Sim a partir do plano do paciente. |

## 6. Substituicoes e exchange groups

### `meal_plan_substitutions`

E a estrutura historica. Agora aceita:

- `base_food`/`option_food`;
- quantidade/unidade;
- identidade fonte/refId do alimento base e opcao;
- `equivalence_mode`: hoje `energy` ou `nutritional`;
- `equivalence_score`, `equivalence_quality`;
- `approved_by_professional`;
- `ai_suggested`.

Problema: ainda e uma lista plana, sem relacao forte com refeicao/slot. A ligacao por item usa identidade fonte+refId, porque `meal_plan_items` e recriado a cada save.

### `exchange_groups`

Mais alinhado ao desenho desejado:

`Plano -> alimento principal -> grupo/subgrupo/papel -> alternativas -> aprovacao`.

Pontos bons:

- Alternativas nascem `SUGGESTED`, nunca aprovadas automaticamente.
- Portal so recebe `APPROVED`.
- Motor filtra por grupo/subgrupo antes de score.
- Restricoes do paciente eliminam candidato.

Gaps:

- Nao e gerado em lote para todo o plano.
- Nao nasce automaticamente a partir das substituicoes do template.
- Nao aparece no print atual.
- Nao ha biblioteca reutilizavel de listas de equivalentes.
- UI ainda compete com painel de substituicoes por item.

## 7. Nutrition Engine e fontes

Fontes presentes no dominio:

- TACO local (`lib/nutrition/taco.ts`, `lib/nutrition/data/taco*.json`).
- CUSTOM/MANUFACTURER via `custom_foods`.
- USDA pilot/allowlist.
- Camada canonica TBCA/TACO/IBGE_POF em `canonical_foods` e relatórios de readiness.

Estado funcional:

- O item do plano aceita `TACO`, `CUSTOM`, `MANUFACTURER`, `USDA`, `TBCA`, `IBGE_POF`.
- O calculo real ainda consome bem `TACO`, `CUSTOM`, `MANUFACTURER`, `USDA`.
- `TBCA`/`IBGE_POF` podem transportar identidade, mas `resolveItemReference` retorna `null` para calculo automatico nesta fase para evitar match textual errado.
- Snapshots nutricionais protegem planos antigos contra mudanca retroativa de base.
- Calculo soma apenas alimentos prescritos; substituicoes/grupos de troca nao entram no total.

Equivalencia hoje:

- `substitution-engine.ts` suporta `energy` e `nutritional`.
- O modo nutricional escolhe nutriente primario pelo papel macro (`protein`, `fat`, `carbohydrate`, `mixed`), ajusta gramas, arredonda e recalcula.
- `food-exchange-engine.ts` adiciona filtro por grupo/subgrupo/papel e diversidade de familia.

Gap vs pedido:

- Nao ha modos explicitos `BALANCED`, `PROTEIN`, `CARBOHYDRATE`, `FAT`, `FIBER`, `CUSTOM` na API/UX. Existem apenas `energy` e `nutritional`.

## 8. IA

### Criar com IA

Fluxo atual:

1. Wizard coleta contexto, metas, refeicoes, preferencias, uso opcional de receitas.
2. LLM retorna apenas nomes/quantidade/unidade; schema nao aceita kcal/macros.
3. Resolver identifica alimentos reais.
4. Itens ambiguos/conflitantes viram `needsReview`.
5. Engine calcula nutrientes.
6. Nutricionista aplica ao editor.
7. So salva/ativa depois de acao humana.

Status: **bom como guardrail**, parcial como produto de consulta rapida porque nao parte de um template selecionado e seus slots.

### Assistente dentro do editor

Existe via `meal-plan-change-agent.ts` para operacoes estruturadas e proposta/confirmacao. Tambem ha refinamento do draft no wizard.

Gap: UX ainda nao e uma camada natural dentro de cada item/refeicao com proposta visual antes/aplicar; existe, mas nao e o fluxo principal de edicao rapida.

### Ajuste automatico

Existe `optimize` para draft e plano salvo. Importante: nao persiste sozinho; troca `meals` localmente e exige salvar. Isso bate com o desenho de "Proposta de ajuste".

Gap: falta experiencia de revisao clara do delta por item como fluxo principal.

## 9. UX do editor

O editor funciona, mas ainda nao parece desenhado para consulta ultra-rapida:

- O alimento deveria ser a prioridade visual; hoje a linha carrega muitas acoes.
- Substituicoes ocupam uma acao visivel por item mesmo quando nao ha alternativas aprovadas.
- `Substituir`, `Substituicoes`, `Subst. auto` e `Grupo de troca` parecem quatro conceitos proximos para a nutricionista.
- O macro footer ajuda muito, mas tambem ocupa area fixa.
- A busca com placeholder contextual por slot e boa, mas depende do template migrado.
- Criar por modelo nao mostra preview nem conflito antes de importar.
- Salvar como modelo existe e e valioso.
- Duplicar dia nao existe; duplicar plano/refeicao/item existe.
- Copiar refeicao existe via duplicar refeicao, mas nao como "copiar para outro dia".

## 10. Portal e impressao

Portal:

- Mostra plano ativo, refeicoes, quantidades, receitas aceitas, suplementos, substituicoes aprovadas e exchange groups aprovados.
- Bom filtro de seguranca: pendencias nao chegam ao paciente.

Impressao:

- Usa a mesma engine nutricional do editor.
- Mostra resumo, refeicoes, macros por refeicao, receitas e substituicoes planas.
- Nao imprime `exchange_groups` aprovados.
- Substituicoes planas sao agrupadas por `base_food`, mas nao necessariamente aparecem logo abaixo do alimento principal.

## 11. Versionamento e snapshots

Implementado:

- `meal_plans.version`.
- `expectedVersion` no PUT.
- `meal_plan_versions` com snapshot criptografado.
- `template_id`/`template_version` no plano criado por modelo quando ha um unico template DIETA ativo.
- Snapshots de alimento/quantidade para itens vinculados.

Gap:

- Template historico nao tem UI de versoes/rollback.
- Duplicar/editar/arquivar template sem afetar planos antigos depende de copia por valor, mas falta experiencia explicita de "versao usada".

## 12. Duplicacoes e arquiteturas paralelas

| Conceito exposto | Implementacao | Problema |
|---|---|---|
| Substituir | Reabre foco/busca do alimento principal | Altera o alimento prescrito, nao cria alternativa. |
| Substituicoes | `meal_plan_substitutions` por item/lista plana | Alternativa aprovada/pendente, mas sem grupo persistido rico. |
| Subst. auto | Lock booleano `substitutions_locked` | Controle tecnico exposto cedo demais. |
| Grupo de troca | `exchange_groups` | Mais correto semanticamente, mas separado e experimental. |

Recomendacao: consolidar a UX em uma unica linguagem:

- Acao principal: `Alternativas`.
- Estado compacto: `3 alternativas aprovadas`.
- Avancado: `Gerar/atualizar grupo de troca`, `Bloquear sugestoes automaticas`, `Revisar pendentes`.

Internamente, migrar gradualmente para `exchange_groups` como modelo rico, mantendo `meal_plan_substitutions` como compatibilidade/print ate concluir migracao.

## 13. Benchmark de mercado

Fontes consultadas:

- Nutrium Help, equivalentes automaticos no plano e templates: https://help.nutrium.com/en/articles/7068252-how-can-i-suggest-foods-with-equivalent-quantities
- Nutrium Blog, meal plan templates: https://nutrium.com/blog/new-meal-plan-templates-in-nutrium-for-your-nutrition-appointments/
- Nutrium Blog, listas de equivalentes e receitas: https://nutrium.com/blog/the-ultimate-nutrium-hacks-that-will-make-your-work-easier/
- WebDiet site oficial: https://webdiet.com.br/site/
- Dietbox Blog, montar dieta mais rapido: https://blog.dietbox.me/como-montar-dieta-mais-rapido-7-dicas-para-acelerar-a-consulta/
- Dietbox Blog, lista de substituicao: https://blog.dietbox.me/quer-saber-como-calcular-a-lista-de-substituicao-de-alimentos/

Ideias de benchmark, nao copia cega:

- Nutrium: templates por faixa energetica, importaveis para o cliente, com ajuste posterior sem alterar original; equivalentes por energia/proteina/carboidrato/gordura e recalculo em lote.
- Nutrium: listas de equivalentes e receitas como bibliotecas reutilizaveis.
- WebDiet: mais de 100 modelos prontos e metodos de prescricao por alimentos, equivalentes ou qualitativo; base TBCA/TACO/fabricantes.
- Dietbox: foco em nao comecar cada atendimento do zero, listas de substituicao reutilizaveis, resumo nutricional em tempo real, modelos prontos/proprios, refeicoes salvas.

Existe no nosso sistema:

- Templates, criacao por modelo, salvar como modelo.
- Calculo em tempo real.
- Receitas.
- Portal/app web.
- Substituicoes e grupos de troca.
- IA assistida com guardrails.

Ainda nao existe no nosso sistema:

- Biblioteca madura de listas de equivalentes reutilizaveis.
- Templates por faixa energetica.
- Importacao com preview/conflitos.
- Metodos de equivalencia configuraveis alem de energia/nutricional.
- Plano semanal completo como fluxo central.

## 14. Matriz de capacidades

| Capability | Current status | Quality | UX | Risk | Go-live? | Recommendation |
|---|---|---|---|---|---:|---|
| Criar manualmente | IMPLEMENTED | Boa | Media | Baixo | Sim | Reduzir ruido visual por item. |
| Criar por modelo | PARTIAL | Media | Fraca | Medio | Sim, com ressalva | Adicionar preview, conflitos e selecao por template real. |
| Criar com IA | PARTIAL | Boa guardrail | Media | Medio | Sim, beta | Conectar a template+slots. |
| Templates com refeicoes/alimentos | IMPLEMENTED | Media | Media | Medio | Sim | Expandir para 5-6 refeicoes e energia. |
| Templates com slots | PARTIAL | Boa base | Fraca | Medio | Nao como feature final | Criar UI slot-native. |
| SYSTEM/USER templates | NOT IMPLEMENTED | - | - | Medio | Nao | Adicionar ownership/origem. |
| Preview de template | NOT IMPLEMENTED | - | - | Alto UX | Nao | P1. |
| Conflitos por restricao antes de importar | NOT IMPLEMENTED | - | - | Alto clinico | Nao | P0/P1. |
| Salvar como modelo | IMPLEMENTED | Media | Boa | Medio | Sim | Remover dados de paciente por contrato/teste. |
| Duplicar template | PARTIAL | Media | Fraca | Baixo | Nao critico | Implementar na biblioteca. |
| Substituicoes por item | IMPLEMENTED/PARTIAL | Boa | Media | Medio | Sim | Compactar estado normal. |
| Grupos de troca | PARTIAL/EXPERIMENTAL | Boa engine | Fraca | Medio | Nao final | Consolidar com substituicoes. |
| Listas equivalentes reutilizaveis | NOT IMPLEMENTED | - | - | Alto tempo | Nao | P1. |
| Modos de equivalencia avancados | PARTIAL | Media | Fraca | Medio | Nao | Adicionar BALANCED/PROTEIN/CARB/FAT/FIBER/CUSTOM. |
| Calculo kcal/macros | IMPLEMENTED/PARTIAL | Boa | Boa | Medio | Sim | Integrar TBCA/IBGE_POF calculavel com cautela. |
| Medidas caseiras | PARTIAL | Media | Media | Medio | Sim | Melhorar cobertura/confianca. |
| Receitas | IMPLEMENTED | Media | Media | Baixo | Sim | Integrar em templates completos. |
| Ajustar quantidades | PARTIAL | Boa base | Media | Medio | Sim beta | Revisao de proposta mais clara. |
| Portal | IMPLEMENTED/PARTIAL | Boa | Media | Medio | Sim | Unificar apresentacao de alternativas. |
| Impressao/PDF | PARTIAL | Media | Media | Medio | Sim com ressalva | Incluir exchange groups compactos. |
| Versionamento/snapshot | IMPLEMENTED | Boa | Baixa visibilidade | Baixo | Sim | UI de historico/versao do template. |
| Acoes em lote | PARTIAL | - | Fraca | Medio | Nao | Gerar/revisar alternativas para todo plano. |

## 15. Wireflow proposto

```txt
PLANO ALIMENTAR

[+ Novo plano]

Como deseja começar?
[Usar modelo] [Criar com IA] [Começar em branco]

USAR MODELO

Buscar modelo...
Filtros: Objetivo | Energia | Restrição | Refeições | Sistema/Meus modelos

Adulto saudável 1800
5 refeições · ~1800 kcal · 115g proteína
Tags: equilibrado, tradicional
[Pré-visualizar] [Usar]

PREVIEW

Café da manhã
Pão integral 2 fatias · Ovos 2 un · Banana 1 un
3 grupos de troca incluídos

Conflitos:
0 incompatibilidades com restrições do paciente

[Usar modelo]

EDITOR

Café da manhã
Pão integral        50g       3 alternativas
Ovos               100g       2 alternativas
Banana              80g       4 alternativas

[+ alimento]

Ações do plano:
[Analisar] [IA] [Gerar alternativas] [Revisar alternativas]
[Ajustar quantidades] [Salvar como modelo] [Imprimir] [Publicar]
```

## 16. Priorizacao

### P0 - necessario para funcionamento correto

- Fazer print consumir `exchange_groups` aprovados ou bloquear seu uso como entrega final ate imprimir corretamente.
- Checar conflitos de restricao antes de importar template.
- Definir origem de template (`SYSTEM`/`USER`) e impedir ambiguidade quando ha mais de um DIETA ativo no mesmo grupo.
- Garantir que editar template pela UI nao destrua slots sem recria-los.

### P1 - melhora fortemente atendimento

- Biblioteca/preview de templates com busca e filtros.
- Templates por energia e variacoes controladas.
- Listas de equivalentes reutilizaveis.
- Compactar UX de alternativas por item.
- Acoes em lote: gerar substituicoes para todo o plano, revisar pendentes, atualizar quantidades.
- Conectar Criar com IA a template selecionado + slots.

### P2 - melhoria posterior

- UI de versionamento/rollback de templates.
- Duplicar/arquivar template.
- Plano semanal mais completo.
- Modo de equivalencia CUSTOM.
- Micronutrientes e cobertura no editor principal.

### P3 - nice-to-have

- Automacoes de sugestao de variacao semanal.
- Analytics de tempo por consulta.
- Sugestoes proativas baseadas em custo/praticidade.

## 17. Plano de implementacao

### Fase A - Correcoes criticas

- Escopo: print de exchange groups, conflito de restricoes no import, ambiguidade de template ativo.
- Arquivos: `client-portal.ts`, print page, `MealPlanEditor.tsx`, rotas de template/import.
- Migration: possivel `template_origin`, `owner_admin_id`.
- Testes: unit + E2E print/portal.
- Rollback: feature flag para ocultar exchange groups se print falhar.

### Fase B - Consolidar alternativas

- Escopo: decidir `exchange_groups` como modelo canonico; mapear `meal_plan_substitutions` legado.
- Arquivos: `ItemSubstitutionsPanel`, `ExchangeGroupPanel`, repositorios.
- Migration: opcional backfill de substituicoes aprovadas para exchange groups.
- Testes: nao somar alternativas, portal/print, aprovacao.
- Rollback: manter leitura legada em paralelo.

### Fase C - Template completo reutilizavel

- Escopo: preview, filtros, energia, numero de refeicoes, tags, conflitos.
- Arquivos: `/dashboard/templates`, `protocol-templates.ts`, `MealPlanEditor.tsx`.
- Migration: `template_origin`, `energy_kcal_min/max`, `tags`, `meal_count`.
- Testes: criar por modelo sem alterar original; conflitos.
- Rollback: manter fluxo simples por grupo.

### Fase D - Listas equivalentes

- Escopo: biblioteca de listas por contexto, reutilizavel em templates e planos.
- Migration: `exchange_lists`, `exchange_list_items`, vinculo template slot/list.
- Testes: CRUD, importacao, portal/print.
- Rollback: listas nao aplicadas nao afetam plano.

### Fase E - IA assistida por template

- Escopo: IA preenche/adapta slots, nunca inventa nutriente.
- Arquivos: `meal-plan-draft-agent.ts`, wizard, resolver.
- Testes: restricoes, ambiguidade, proposta antes de aplicar.
- Rollback: manter wizard atual.

### Fase F - UX avancada

- Escopo: modo consulta rapida, revisao de alternativas, ajuste de quantidades com diff.
- Testes: Playwright desktop/mobile com contagem de cliques e screenshots.
- Rollback: manter editor atual atras de flag.

## 18. Respostas finais

MEAL_PLAN_CURRENT_STATE: **PARTIAL**

MEAL_PLAN_GO_LIVE_READY: **nao** para a experiencia desejada de consulta rapida com templates completos e alternativas prontas; **sim com ressalvas** para uso controlado/manual por profissional revisando tudo.

TOP_5_BLOCKERS:

1. Criar por modelo nao tem biblioteca/preview/conflitos; importa por grupo alvo de forma cega.
2. Templates atuais nao sao completos o bastante para 4-6 refeicoes prontas por energia/variacao.
3. Substituicoes e exchange groups coexistem como arquiteturas paralelas.
4. Print nao consome `exchange_groups`, apesar de portal consumir.
5. Falta biblioteca de listas equivalentes reutilizaveis.

TOP_10_NEXT_IMPROVEMENTS:

1. Preview de template antes de importar.
2. Checagem de conflito com alergias/restricoes antes de usar modelo.
3. Compactar item: alimento, quantidade, unidade e contador de alternativas.
4. Consolidar `Substituicoes`/`Grupo de troca` em uma unica UX de Alternativas.
5. Imprimir exchange groups aprovados.
6. Criar listas de equivalentes reutilizaveis.
7. Adicionar origem SYSTEM/USER e filtros de template.
8. Templates por faixa energetica e variacoes sem duplicacao descontrolada.
9. IA baseada em template+slots, nao plano livre.
10. Acoes em lote: gerar/revisar alternativas e ajustar quantidades.

Parar apos este relatorio. Nao iniciar proxima fase automaticamente.
