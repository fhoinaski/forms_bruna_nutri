# R8.1D — Schema e lineage

| Runtime | Schema esperado | Migration | Presente no worktree atual | Aprovada em `main` | Necessária |
|---|---|---|---|---|---|
| estruturas SIMPLE/OPTIONS/COMBINATION | `meal_structure`, `patient_instruction`, tabelas de opções/grupos e FKs de itens | `20260826_0069_meal_plan_flexible_structure.sql` | Sim, não rastreada | Não | Sim para o runtime flexível atual |

A migration está commitada na lineage `main` atual em `efd57dd` (também havia
origem em `codex/meal-flex-r1`). A prova remota read-only confirmou que a
migration está aplicada, com 69 migrations no total e todos os objetos do
contrato presentes. O ambiente configurado não possui rótulo TEST/STAGING/
PRODUCTION, portanto `REMOTE_DATABASE_ENV: UNKNOWN`.

`LINEAGE_SCHEMA_BLOCKER: nao`
