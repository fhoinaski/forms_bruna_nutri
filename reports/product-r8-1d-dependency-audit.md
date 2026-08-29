# R8.1D — Auditoria de dependências

## Reprodução

| Falha | Execução isolada | Evidência | Classificação |
|---|---|---|---|
| Consulta → Plano | PASS | `patient-record-p6-integrations`, Chromium, worker único, trace ativo | Não reproduzida isoladamente |
| Antropometria | PASS | `patient-record-p5-anthropometry`, Chromium, worker único, 7 cenários | Não reproduzida isoladamente |

Não foi aplicado fix para essas duas falhas: não há causa reproduzível e não
seria seguro alterar Produto/UX para esconder um erro ausente no teste isolado.

## Baseline

Foi criado o worktree limpo `codex/r8-1d-baseline` em
`7ff69481147f45b855c6c9da3150109c41c152b4`. A execução nele está bloqueada
até uma instalação independente de dependências: Turbopack rejeita junction de
`node_modules` externo. O junction temporário foi removido. Portanto, baseline
cross-commit ainda não está provado.
