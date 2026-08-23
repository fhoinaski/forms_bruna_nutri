# R4 - Exchange Current State Audit

Data: 2026-08-23

## Fluxo Atual

Meal item:
- `components/dashboard/MealItemsEditor.tsx`
- Cada item carrega identidade estruturada (`food_source`, `food_ref_id`, `canonical_food_id`) e quantidade resolvida em gramas via `resolveFoodItemMacros`.
- A linha compacta abre o drawer de Trocas para o alimento selecionado.

Exchange drawer:
- `components/dashboard/MealItemsEditor.tsx`
- O drawer recebe alimento principal, refeição, gramas resolvidos, grupo de troca existente e alternativas.
- R4 passa a usar o grupo mais recente para a identidade do alimento e sinaliza stale quando a gramatura do grupo difere da prescrição atual.

API:
- `app/api/admin/clients/[id]/meal-plans/exchange-groups/route.ts`
- `POST` gera trocas determinísticas para um item ou em lote.
- `GET` lista grupos por plano.
- `app/api/admin/clients/[id]/meal-plans/exchange-groups/[groupId]/route.ts`
- `PATCH` aprova, rejeita, edita quantidade e adiciona manualmente.
- R4 permite adicionar manualmente sem quantidade informada; o backend calcula a quantidade equivalente.

Repository:
- `lib/repositories/exchange-groups.ts`
- Gera e persiste `exchange_groups` e `exchange_group_alternatives`.
- Sugestões sempre nascem `SUGGESTED`.
- Somente `approveAlternatives` muda para `APPROVED`.
- Portal/print consomem somente `APPROVED`.

Curated exchange lists:
- `lib/repositories/curated-exchange-lists.ts`
- Integração preservada por `CURATED_EXCHANGE_LISTS_MODE`.
- R4 não ativa modo global ON.
- Curadoria continua como elegibilidade/contexto, não aprovação.

Global ranking / engine only:
- `lib/nutrition/food-exchange-engine.ts`
- `ENGINE_ONLY` permanece baseline.
- `CURATED_ELIGIBILITY_GLOBAL_RANK` permanece pilot/shadow conforme config.
- R4 ajusta UX e revisão clínica, sem criar engine nova.

Quantity calculation:
- Quantidade vem de `findFoodSubstitutes`/motor de equivalência existente.
- Adição manual agora também calcula no backend, usando alimento principal congelado no grupo e candidato escolhido.

Persistence/status:
- `exchange_groups` congela alimento principal, quantidade principal, grupo/role e modo de geração.
- `exchange_group_alternatives` congela alimento, quantidade equivalente, nutrientes e `state`.
- Estados usados: `SUGGESTED`, `APPROVED`, `EDITED`, `REJECTED`.

Save/reload:
- Trocas são persistidas imediatamente nas ações do drawer.
- Fechar o drawer não descarta alterações, porque aprovação/rejeição/adição manual já chamou API.

Portal:
- `lib/repositories/client-portal.ts`
- `lib/repositories/meal-plan-alternatives.ts`
- Somente trocas `APPROVED` aparecem.
- R4 filtra grupos stale quando a gramatura atual do item diverge do grupo aprovado.

Print:
- `app/dashboard/clients/[id]/print/page.tsx`
- Usa o mesmo agregador de trocas aprovadas.
- Herda o filtro de stale.

## Código Legado

`meal_plan_substitutions`:
- Classificação: COMPATIBILITY
- Continua suportando modelos/fluxos legados e fallback quando não há grupos canônicos.
- Não remover nesta fase.

`exchange_groups`:
- Classificação: KEEP
- Tabela canônica para alimento principal e contexto do grupo de Trocas.

`exchange_group_alternatives`:
- Classificação: KEEP
- Tabela canônica para sugestões/aprovadas/rejeitadas com snapshot de quantidade.

Curated lists:
- Classificação: KEEP
- Biblioteca profissional de elegibilidade/contexto.
- Não equivale a aprovação profissional.

ENGINE_ONLY:
- Classificação: COMPATIBILITY
- Baseline determinístico e fallback.

Campos técnicos de origem/ranking:
- Classificação: DEPRECATE_LATER na UX normal
- Podem permanecer em dados/auditoria/debug, mas não devem aparecer no fluxo clínico principal.
