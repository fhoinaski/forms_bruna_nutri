# R8.1D — Schema e lineage

| Runtime | Schema esperado | Migration | Presente no worktree atual | Aprovada em `main` | Necessária |
|---|---|---|---|---|---|
| estruturas SIMPLE/OPTIONS/COMBINATION | `meal_structure`, `patient_instruction`, tabelas de opções/grupos e FKs de itens | `20260826_0069_meal_plan_flexible_structure.sql` | Sim, não rastreada | Não | Sim para o runtime flexível atual |

A migration está commitada em `codex/meal-flex-r1` (`9a2319d`), mas não na
lineage `main` atual. Nenhuma alteração de banco foi feita.

`LINEAGE_SCHEMA_BLOCKER: sim`
