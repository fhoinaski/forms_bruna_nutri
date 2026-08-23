# Meal Plan Go-Live P0 Hardening

Data: 2026-08-22

## 1. P0 confirmados

- Importacao por modelo agora resolve um unico template `DIETA` por `target_group`, priorizando `SYSTEM + is_default`.
- Templates de dieta clonados geram slots estruturados em `diet_template_slots` e `diet_template_slot_foods`.
- Preview de importacao bloqueia conflito clinico/alimentar antes da clonagem quando nao ha confirmacao explicita.
- Alternativas aprovadas sao entregues ao portal e ao impresso por uma leitura canonica unica.
- E2E nao depende mais de porta fixa 3000 e semeia templates antes do servidor Next.

## 2. P0 corrigidos

- Criada migration `db/20260822_0065_meal_plan_go_live_p0.sql` com `template_origin`, `owner_admin_id`, `is_default`, indice de resolucao e unicidade parcial para default `SYSTEM` de dieta.
- `lib/repositories/protocol-templates.ts` agora grava/reconstroi slots junto com meals/items do template.
- `lib/repositories/meal-plans.ts` agora tem preview, resolucao deterministica de template, bloqueio de ambiguidade e bloqueio por conflito de restricao.
- `components/dashboard/MealPlanEditor.tsx` usa preview antes de criar por modelo e informa template/origem/versao/contagens.
- `db/seed-templates.ts` grava templates `SYSTEM`, `is_default=1`, slots e slot foods idempotentes.
- `lib/repositories/meal-plan-alternatives.ts` centraliza alternativas aprovadas de `exchange_groups` e legado.
- `lib/repositories/client-portal.ts` evita duplicidade entre grupos canonicos e painel legado.
- `app/dashboard/clients/[id]/print/page.tsx` mostra alternativas aprovadas inline sob o item, sem somar alternativa no total.
- `playwright.config.ts` e `e2e/helpers/webserver-entrypoint.mjs` corrigem porta parametrizavel e seed E2E.

## 3. Estrategia de seed

- Seed usa ids estaveis (`tpl-<target_group>-dieta-base`) e `INSERT OR REPLACE`.
- Antes de recriar estrutura, remove `diet_template_slot_foods`, `diet_template_slots`, `diet_template_items` e `diet_template_meals` do template.
- O seed respeita `CLOUDFLARE_D1_API_BASE_URL`, permitindo rodar contra o shim local do E2E.
- Reexecutar o seed nao deve duplicar templates, refeicoes, itens ou slots.

## 4. Templates SYSTEM disponiveis

- Os templates de dieta semeados passam a ter `template_origin='SYSTEM'`.
- Templates `DIETA` semeados recebem `is_default=1` por `target_group`.
- Templates criados/salvos pelo usuario usam `template_origin='USER'` e nao entram como default global.

## 5. SYSTEM vs USER

- Resolucao para importacao:
  1. um `SYSTEM + is_default` ativo para o grupo;
  2. senao, um unico `SYSTEM` ativo;
  3. senao, um unico `DIETA` ativo total;
  4. qualquer ambiguidade retorna 409.
- API de templates aceita os novos metadados e preenche `owner_admin_id` para criacao `USER` via admin.
- `save-as-template` marca como `USER`; o owner ainda fica `NULL` porque a funcao de repositorio nao recebe admin id.

## 6. Conflito de restricoes

- Preview consulta prontuario nutricional e marcadores clinicos estruturados.
- Detecta conflitos por marcadores estruturados via `checkFoodAgainstPatientRestrictions`.
- Tambem cobre texto livre de alergias, restricoes, aversoes, diagnosticos e flags por termos como leite/lactose, ovo, oleaginosas, soja, trigo/gluten, peixe, frutos do mar, vegetariano/vegano.
- Sem `confirmed=true`, plano com conflito nao e clonado.

## 7. Integridade dos slots

- Cada item de template reconstruido ganha slot e `slot_food` correspondentes.
- Na clonagem para plano, item carrega `template_slot_id`, grupo, subgrupo, papel nutricional e elegibilidade de troca.
- Testes focados cobrem slot migration/paridade de substituicoes e P0 de clonagem/conflito.

## 8. exchange_groups vs legacy

- Fonte canonica: `getApprovedMealPlanAlternatives(plan)`.
- `exchange_groups` aprovados entram primeiro.
- Substituicoes legadas aprovadas entram como fallback/compatibilidade.
- Dedupe por alimento primario + alimento opcao + quantidade + unidade evita mostrar a mesma troca duas vezes.

## 9. Portal

- Se ha `exchange_groups` canonicos, portal entrega `exchangeGroups` e oculta painel legado.
- Se ha apenas legado, portal preserva o painel antigo e nao duplica em `exchangeGroups`.
- E2E focado de portal/substituicoes passou.

## 10. Print

- Impresso busca alternativas aprovadas pela mesma fonte canonica.
- Alternativas aparecem inline em cada item: "Pode substituir por".
- Total nutricional continua calculado apenas pelos itens prescritos do plano ativo.

## 11. E2E infrastructure

- `E2E_PORT`/`PORT` controlam a porta; default continua 3000.
- `PLAYWRIGHT_BASE_URL` pode sobrescrever URL.
- `PLAYWRIGHT_REUSE_EXISTING_SERVER=1` habilita reutilizacao fora de CI.
- Webserver E2E roda migrations, seed inicial, seed de templates e entao sobe o Next.

## 12. E2E results

- `npm run test:e2e -- e2e/meal-plan.spec.ts e2e/meal-plan-substitutions.spec.ts --project=chromium-desktop`: 10 passed.
- `npm run test:e2e -- e2e/meal-plan-ai-wizard-complete.spec.ts e2e/meal-plan-full-cycle.spec.ts e2e/patient-portal.spec.ts --project=chromium-desktop`: 4 passed, 3 failed inicialmente; depois das correcoes, `meal-plan-ai-wizard-complete` e `patient-portal` passaram em rerun focado.
- `npm run test:e2e -- --project=chromium-desktop`: 98 passed / 102 failed antes das ultimas correcoes de spec; falhas confirmadas depois ficaram reduzidas ao ciclo completo `meal-plan-full-cycle`.
- Pendencia remanescente verificada: `e2e/meal-plan-full-cycle.spec.ts` ainda falha porque proposta IA altera editor/API, mas o impresso ativo permanece com o total anterior.

## 13. Manual acceptance

- API manual de importacao por template retornou preview 200 com template `SYSTEM`, versao, contagem de refeicoes/itens e sem conflitos para paciente limpo.
- Criacao confirmada retornou plano com template id/version, refeicoes, itens, slots, substituicoes e suplementos.
- UI/E2E focado validou criar por modelo, salvar, ativar, portal, print e substituicoes aprovadas.

## 14. Feature flags

- Nenhuma feature flag nova foi adicionada.
- Comportamento P0 fica ativo por migration + seed + codigo de resolucao.

## 15. Riscos remanescentes

- `saveMealPlanAsDietTemplate` ainda nao associa `owner_admin_id`.
- Heuristica inicial de classificacao de grupo/subgrupo de slot e deterministica, mas nao substitui curadoria clinica fina.
- Suíte completa oficial ainda nao esta verde por uma falha fora do fluxo de template import: IA confirmada nao atualiza o impresso ativo no teste de ciclo completo.
- `npm test` completo pode estourar timeout no benchmark de food resolver sob carga concorrente; isolado com `--testTimeout=15000` passou.

## 16. GO/NO-GO

NO-GO oficial para go-live completo enquanto `e2e/meal-plan-full-cycle.spec.ts` nao estiver verde.

Gates passados:

- `npx tsc --noEmit --incremental false`
- `npm run lint`
- `npm run build`
- `npm run migrate:d1:check`
- `npm run schema:runtime-check`
- `npm run ci:artifact-check`
- `npm test -- tests/meal-plan-go-live-p0.test.ts tests/template-slots-migration.test.ts tests/meal-plan-substitution-parity.test.ts`
- `npm test -- tests/food-resolver-benchmark.test.ts --testTimeout=15000`
- E2E focado de plano/substituicoes: 10/10

Gates nao verdes:

- `npm test`: 1731/1732 no run completo; falha por timeout do benchmark com timeout default de 5000 ms.
- `npm run test:e2e -- --project=chromium-desktop`: ainda requer rerun completo apos correcoes, mas a pendencia funcional remanescente conhecida e `meal-plan-full-cycle`.

MEAL_PLAN_P0_REMAINING = 1
MEAL_PLAN_E2E_READY = nao
MEAL_PLAN_GO_LIVE_READY = nao
