# R8.2 — Audit

## Base e escopo

- Base limpa: `0bb44d2` (`origin/main`), contendo a lineage R8.1.
- Não há migration, write remoto ou domínio paralelo neste escopo.
- R8.2 orquestra a sessão de consulta, prontuário, antropometria, plano e agenda já existentes.

## Fluxo atual

`POST /api/admin/clients/[id]/consultation` é idempotente: uma sessão em andamento é devolvida em vez de duplicada. A exclusividade é garantida por índice parcial no banco, não por check-then-insert. A rota dedicada é `/dashboard/clients/[id]/consulta?sessionId=...` e já preserva a segurança de vínculo paciente/sessão.

## Decisão R8.2

Evoluir `ConsultationWorkspace` com etapas guiadas, livres e refletidas na URL. Cada etapa encaminha aos módulos existentes quando a edição deve permanecer no módulo de origem; nenhum editor paralelo, publicação automática ou decisão clínica por IA será criado.
