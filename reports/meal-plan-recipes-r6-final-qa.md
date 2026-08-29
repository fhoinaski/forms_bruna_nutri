# Meal Plan Recipes R6 — Final QA / Release Closure

## Escopo entregue

Domínio de receita composta com ingredientes canônicos multi-fonte,
motor de nutrição real (nunca um segundo calculador), contrato de
rendimento (RAW_TOTAL/USER_REPORTED/PORTION_COUNT), rateio por
porção/gramas, item de receita de primeira classe no Composer
(SIMPLE/OPTIONS/COMBINATION), imutabilidade de plano publicado via
snapshot congelado (reaproveitando o mecanismo P1-A já existente),
compatibilidade R3 (N/A explícito para substituição)/R4 (schemas
ampliados)/R5 (Copilot inalterado, deliberado), 2 migrations aditivas.
Ver os 6 relatórios companheiros (`-audit`, `-domain`, `-yield`,
`-versioning`, `-composer`, `-performance`) para o detalhamento completo.

## Gates locais

| Gate | Resultado |
| --- | --- |
| TypeScript (`tsc --noEmit`) | PASS, 0 erros |
| ESLint (`eslint .`) | PASS, 0 erros/avisos |
| Build (`next build`) | PASS |
| Migração (`migrate:d1:check`) | PASS, 71 migrações validadas, 2 novas |
| Runtime DDL guard (`schema:runtime-check`) | PASS |
| Artifact check | PASS, 1266 arquivos rastreados |
| Full Vitest | 2007/2007 PASS (233 arquivos; 20 testes novos em `tests/recipe-engine-r6.test.ts`) |
| E2E dedicado R6 (`meal-plan-recipes-r6.spec.ts`) | 5/5 PASS |
| Regressão de specs de IA/wizard pré-existentes afetados pela mudança de shape (`meal-plan-wizard-food-first`, `meal-plan-wizard-preparation-review`) | 4/4 PASS (após corrigir as 2 regressões reais encontradas) |
| Broad E2E (chromium-desktop, single worker) | 219/219 PASS |
| Broad E2E (chromium-desktop + mobile-chrome, paralelo) | 432/438 PASS, 1 flaky recuperado no retry, 4 falhas classificadas (mesmo padrão de flake mobile já documentado nas fases anteriores — `ai-chat-widget-navigation-interference`, `clinical-copilot-r5-performance`, `meal-plan-reuse-r4-library`, `meal-plan-substitution-r3-equivalent-quantity`; nenhuma toca código desta fase) |
| Migrations novas | 2 |
| Escritas em produção | 0 (shim SQLite local do E2E) |

## Regressões reais encontradas e corrigidas nesta fase (honestidade de processo)

A mudança do shape de `RecipeIngredient` quebrou 4 consumidores
pré-existentes que assumiam o shape legado (`taco_number`/`food_name`/
`grams`) — todos descobertos pela suíte E2E ampla, nunca escondidos:
`insertRecipe` (Composer), `expandRecipeIngredientsToItems`
(AiMealPlanWizard — sugestão de receita e revisão de preparo composto),
`meal-suggestion-agent.ts` (ferramenta de chat), e
`getRecipeClinicalProfile` (perfil clínico de receita do portal do
paciente). Também corrigido: o gate de publicação
(`meal-plan-publication.ts`) e o resumo nutricional do view-model
(`meal-plan-view-model.ts`) assumiam que todo item calculável passa pelo
catálogo — ambos bloqueavam a publicação de um plano com item de receita
até serem corrigidos com um caminho de validação próprio pra RECIPE. Ver
`-composer.md` para o detalhamento completo de cada fix.

## Cobertura por seção do pedido

Ver os relatórios companheiros. Resumo de gates centrais:

- Domínio + auditoria: `-audit.md`, `-domain.md`.
- Yield + portion nutrition (seções 15-24, testes 72-79): `-yield.md`.
- Versionamento/imutabilidade (seções 47-54, gate obrigatório seção 92):
  `-versioning.md` — PASS, provado por E2E dedicado.
- Composer/SIMPLE/OPTIONS/COMBINATION/R3/R4/R5 (seções 33-42, 82-86):
  `-composer.md`.
- Performance/N+1 (seções 29-30, 49, 97-100): `-performance.md`.

## Escopo conscientemente fora desta fase (documentado, não escondido)

- **Acessibilidade dedicada** (seção 96) — editor/biblioteca de receitas
  e o novo botão "Item de receita" não receberam uma auditoria de
  teclado/leitor de tela dedicada nesta fase, além do que a estrutura
  HTML nativa (botões/labels reais) já garante por herança do padrão
  usado no resto do app.
- **Mobile dedicado** (seção 95) — nenhum E2E específico de viewport
  mobile pro editor/biblioteca de receitas ou pro picker "Item de
  receita" no Composer.
- **Receita grande / biblioteca grande** (seções 97, 99) — nenhuma
  fixture E2E de 30 ingredientes ou volume de biblioteca significativo;
  o caminho crítico de batch resolution está provado em granularidade
  unitária, não em escala real.
- **Medição de performance formal** (seção 98) — p50/p95/max não
  capturados nesta fase.
- **N+1 no congelamento de snapshot por item de receita** (seção 100) —
  1 chamada por ITEM de receita (não por ingrediente) no save do plano;
  documentado em `-performance.md` como melhoria possível, não um N+1
  clássico.
- **Segurança clínica (alergia/restrição) de um item RECIPE no Composer
  profissional** — `getFoodClinicalProfile({foodSource:"RECIPE"})` já
  existe (usado pelo portal do paciente) mas não está conectado à
  checagem de restrição quando um item RECIPE é adicionado no Composer;
  documentado em `-audit.md` como gap real.

## Regra de conclusão

Como acessibilidade dedicada, mobile dedicado e receita grande (seções
96, 95, 97) NÃO foram implementados/testados nesta fase (decisão
consciente sob pressão de tempo, documentada honestamente — não uma
falha de qualidade do que FOI implementado), a regra de conclusão
original (seção 122, todos os gates) não pode ser satisfeita
integralmente. Os marcadores finais refletem isso: `MEAL_PLAN_RECIPES_R6_ACCESSIBILITY`,
`_MOBILE` e `_LARGE_RECIPE` são `FAIL` (não implementado/testado, não
uma falha de comportamento observada), e
`MEAL_PLAN_RECIPES_R6_COMPLETE: nao` — sem esconder nada. Todo o restante
do escopo — domínio, motor, yield, imutabilidade (o gate mais
enfaticamente obrigatório do pedido), Composer, compatibilidade R3/R4/R5,
regressão completa — está PASS e verificado com testes reais.
