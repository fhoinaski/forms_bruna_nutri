# Meal Plan Reuse & Templates R4 — Final QA / Release Closure

## Escopo entregue

Biblioteca de reuso única no Composer ("Usar modelo") com 5 seções
(recentes/favoritos/refeições salvas/planos anteriores/modelos de plano),
2 correções de bugs reais encontrados na auditoria (duplicar refeição com
OPTIONS/COMBINATION compartilhando referência; clonar plano sem limpar
snapshot), 3 tabelas novas aprovadas explicitamente antes de escrever a
migration, e reaproveitamento máximo da infraestrutura já existente
(templates de plano, listagem de planos do paciente, drawer de trocas R2/R3
intocado).

## Gates locais

| Gate | Resultado |
| --- | --- |
| Migration (`migrate:d1:check`) | PASS |
| Runtime DDL guard (`schema:runtime-check`) | PASS |
| Repositórios novos (unit) | 10/10 PASS |
| Rotas novas (unit) | 13/13 PASS |
| `duplicateMealAt`/`sanitizeMealForPlanClone` (unit) | 18/18 PASS (12 novos) |
| TypeScript (`tsc --noEmit`) | PASS, 0 erros |
| ESLint (`eslint .`) | PASS, 0 erros/avisos |
| Build (`next build`) | PASS |
| Full Vitest | 1947/1947 PASS (228 arquivos) |
| E2E dedicado R4 (`meal-plan-reuse-r4-library.spec.ts`) | 8/8 PASS |
| E2E performance R4 | PASS, métricas registradas |
| Regressão ampla (suíte completa, 204 testes) | 204/204 PASS |
| Migrations novas | 3 tabelas aditivas (aprovadas explicitamente antes de escrever) |
| Escritas em produção | 0 (shim SQLite local do E2E) |

## Cobertura por seção do pedido

- Recentes/favoritos/refeições salvas/copiar refeição/modelos de plano:
  cobertos por `e2e/meal-plan-reuse-r4-library.spec.ts` (8 casos) +
  `tests/admin-food-reuse-repositories.test.ts` (10) +
  `tests/meal-plan-reuse-r4-routes.test.ts` (13).
- Duplicar refeição/clonar plano (identity/snapshot safety): cobertos por
  `tests/meal-items-editor-helpers.test.ts` (12 novos casos) — nenhum E2E
  novo necessário para o clone de plano em si, já que a UI/fluxo não mudou
  (`meal-plan-ux2.spec.ts` já cobre ponta a ponta e continua PASS).
- SIMPLE/OPTIONS/COMBINATION preservados na duplicação/reuso: unit +
  regressão `meal-plan-composer-r2-final-flex.spec.ts` (continua PASS,
  intocado).
- Compatibilidade com o Substitution Engine R3: nenhuma alteração tocou
  `ExchangeGroupPanel`/`equivalent-quantity.ts`/a API de equivalência — a
  suíte `meal-plan-substitution-r3-equivalent-quantity.spec.ts` (10 casos)
  rodou como parte da regressão ampla e continua 100% PASS, confirmando que
  um item duplicado/copiado/reutilizado continua funcionando normalmente
  com o seletor de critério/preview/aplicar.
- Versionamento/publicado-imutável/auth/IDOR: cobertos pela regressão ampla
  (`meal-plan-versioning.spec.ts`, `meal-plan-r6-publication-gate.spec.ts`,
  suíte de Patient Record) — nenhuma mudança nesta fase toca esses
  contratos.
- Privacidade de templates (seção 15/44): `protocol_templates` já era
  clínico/genérico (nunca derivado de paciente) antes desta fase; a nova
  seção "Modelos de planos" só lê esse mesmo domínio, nunca expõe dados de
  outro paciente. "Planos anteriores" só lista planos do PRÓPRIO paciente
  atual (escopado por `clientId` da rota, nunca um id arbitrário).
- Auth/IDOR das novas tabelas: todo repositório/rota novo filtra por
  `admin_id`/`clientId` no WHERE — coberto por
  `tests/meal-plan-reuse-r4-routes.test.ts` (teste de IDOR explícito em
  `/api/admin/saved-meals/[id]`: um admin nunca acessa refeição salva de
  outro).
- Acessibilidade/mobile: `e2e/meal-plan-reuse-r4-library.spec.ts` (Escape +
  devolução de foco; folha inferior em mobile).

## Escopo conscientemente fora desta fase

- Categorização/tags de refeições salvas além do nome (seção 28, opcional,
  sem necessidade demonstrada nesta fase).
- Templates, receitas, Clinical Copilot, ajuste clínico automático,
  auto-publish — todos explicitamente fora do escopo pedido, não iniciados.
