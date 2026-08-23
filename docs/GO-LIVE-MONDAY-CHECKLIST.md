# GO-LIVE MONDAY CHECKLIST - Meal Plan

Data da validacao: 2026-08-22/2026-08-23

Status R7: NO-GO para go-live final do Plano Alimentar.

Motivo: o fluxo critico R1-R7 passou, mas a suite E2E completa `chromium-desktop` falhou com 28 testes. O modulo nao deve ir para producao ate a suite completa ser corrigida ou ate cada falha ser reclassificada com evidencia objetiva.

## Antes do deploy

- Confirmar backup D1 atualizado antes de publicar.
- Confirmar que `.env.local`, `data-local/`, `tbca_completa.json`, `*.sqlite`, backups, tokens e segredos nao estao staged para commit/deploy.
- Rodar migrations em ambiente de staging antes de producao.
- Validar que `E2E_TEST_MODE` e fixtures deterministicas estao desativados em producao.
- Manter IA de plano alimentar em piloto/off se nao houver provider real configurado e monitorado.
- Manter canonical resolver em modo conservador/piloto, habilitando escopos apenas quando houver observabilidade.

## Gates obrigatorios

- `npm run ci:artifact-check`
- `npm run migrate:d1:check`
- `npm run schema:runtime-check`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npm test`
- `$env:E2E_PORT='3001'; npm run test:e2e -- --project=chromium-desktop`

Resultado R7:

- `npm run ci:artifact-check`: PASS
- `npm run migrate:d1:check`: PASS
- `npm run schema:runtime-check`: PASS
- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm test`: PASS, 204 arquivos / 1785 testes
- `npm run build`: PASS
- `npm run migrate:d1`: PASS, banco ja atualizado
- R1-R7 E2E combinado: PASS, 32 testes desktop/mobile
- Full E2E `chromium-desktop`: FAIL, 92 passou / 28 falhou

## Smoke manual pos-deploy

- Nao executar go-live ate o full E2E desktop passar.
- Criar plano por template adulto saudavel.
- Confirmar alternativas em pao, ovo e banana.
- Salvar e recarregar o plano.
- Revisar e publicar o plano pelo gate de publicacao.
- Abrir portal do paciente.
- Conferir paridade entre editor, impressao e portal.
- Simular uma solicitacao segura de substituicao pelo portal e confirmar que nada altera automaticamente o plano.

## Rollback

- Se algum P0 surgir, interromper uso do modulo de plano alimentar para novas prescricoes.
- Restaurar a versao anterior do app.
- Restaurar backup D1 somente apos confirmar impacto e janela operacional.
- Manter registro do plano/paciente afetado, horario e acao tomada.
