# Meal Plan Runbook

Data: 2026-08-23

## Status operacional

O modulo de Plano Alimentar esta funcionalmente reestruturado de R1 a R7, mas o go-live final permanece bloqueado enquanto a suite E2E completa `chromium-desktop` nao estiver verde.

Resumo:

- Fluxo critico R1-R7: PASS, 32 testes em desktop/mobile.
- Gates de codigo, build, unit e schema: PASS.
- D1: 67 migrations validadas; `npm run migrate:d1` retornou banco atualizado.
- Full E2E desktop: FAIL, 92 passou / 28 falhou.
- Decisao R7: NO-GO ate corrigir/classificar a suite E2E completa.

## Fluxo aprovado

Fluxo clinico validado:

1. Criar plano a partir de template ou fixture estruturada.
2. Editar rascunho com identidade de alimento preservada.
3. Manter quantidades prescritas exatas.
4. Gerar/revisar alternativas por grupo de troca.
5. Bloquear publicacao com alimento nao resolvido, quantidade invalida ou troca stale.
6. Publicar somente plano revisado.
7. Entregar ao portal e print somente a versao ativa.
8. Manter rascunhos isolados do paciente ate nova publicacao.

## Flags recomendadas

Manter conservador em producao:

- `CURATED_EXCHANGE_LISTS_MODE`: `off`, `shadow` ou `pilot`, nao global.
- `CURATED_EXCHANGE_PILOT_ADMIN_IDS`: preencher apenas para admins piloto.
- `CURATED_EXCHANGE_RANKING_STRATEGY`: manter estrategia validada em piloto.
- `CANONICAL_FOOD_RESOLVER_MODE`: conservador/piloto.
- `E2E_TEST_MODE`: desativado em producao.
- `INTAKE_AI_TEST_PROVIDER`: desativado em producao.

IA deve permanecer assistiva: nao calcula nutrientes, nao publica e nao altera plano ativo sem revisao profissional.

## Operacao diaria

Antes de usar com paciente real:

- Confirmar que ha exatamente um plano ativo por paciente.
- Confirmar que o plano ativo abre no portal.
- Confirmar que o print oficial, sem `planId`, mostra a mesma versao ativa do portal.
- Confirmar que rascunhos nao aparecem no portal.
- Usar "Revisar e publicar" para ativar um plano.
- Nao publicar via alteracao direta de status.

## Templates

Ao atualizar templates:

- Rodar `npm run seed:templates`.
- Rodar novamente para confirmar idempotencia.
- Rodar `npm run migrate:d1:check`.
- Validar que templates de sistema preservam slots, refeicoes e roles.
- Nao alterar templates ativos sem revisar impacto nos planos criados.

## Trocas e alternativas

Contrato operacional:

- Lista curada define quais alimentos podem substituir.
- Motor deterministico calcula quantidade equivalente.
- Nutricionista aprova ou rejeita.
- Portal/print exibem somente alternativas aprovadas.
- Sugestoes rejeitadas, pendentes, stale ou tecnicas nao chegam ao paciente.

Se uma quantidade primaria mudar, revisar as trocas antes de publicar.

## Publicacao

Publicacao valida exige:

- Plano em rascunho editavel.
- Alimentos criticos resolvidos.
- Quantidades validas.
- Sem troca aprovada stale.
- Review sem blockers.
- `expectedVersion` atualizado.

Erros esperados:

- `422 MEAL_PLAN_PUBLICATION_BLOCKED`: plano precisa de correcao.
- `409`: versao concorrente mudou; revisar novamente.
- `404`: plano/grupo nao pertence ao paciente da URL.

## Portal e print

Portal:

- Usa somente active delivery.
- Nao mostra controles administrativos.
- Nao mostra scores, debug, status internos ou termos tecnicos.

Print:

- Sem `planId`, usa somente plano ativo.
- Com `planId`, funciona como preview administrativo explicito.
- Deve manter estrutura A4 e paridade estrutural com portal.

## Seguranca

Regras validadas em R7:

- Rotas de grupos de troca validam que `mealPlanId` pertence ao `clientId` da URL.
- PATCH/DELETE de grupo de troca validam ownership do plano antes de alterar.
- Estado com multiplos planos ativos falha fechado no delivery.
- Portal nao entrega rascunho por acidente.

## Gates obrigatorios antes de release

Executar:

- `npm run ci:artifact-check`
- `npm run migrate:d1:check`
- `npm run schema:runtime-check`
- `npm run lint`
- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- `npm run test:e2e -- --project=chromium-desktop`

Enquanto o ultimo comando falhar, o modulo permanece NO-GO.

## Smoke manual pos-deploy

1. Abrir cliente real de teste.
2. Criar rascunho a partir de template.
3. Confirmar roles, alimentos e quantidades.
4. Gerar e revisar alternativas de um carboidrato principal.
5. Publicar via review.
6. Abrir portal do paciente.
7. Abrir print oficial.
8. Confirmar mesma versao, mesmas quantidades e somente alternativas aprovadas.
9. Criar novo rascunho com quantidade diferente.
10. Confirmar que portal continua mostrando a versao ativa anterior.

## Rollback

Se surgir P0:

- Suspender novas prescricoes pelo modulo.
- Preservar evidencias: paciente, plan id, version id, horario e acao executada.
- Reverter app para versao anterior aprovada.
- Restaurar D1 apenas se houver corrupcao confirmada e backup validado.
- Registrar incidente em `docs/SEGURANCA-E-INCIDENTES.md`.
