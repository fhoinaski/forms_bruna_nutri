-- BUGFIX CRÍTICO encontrado durante a Fase 8 (auditoria de templates): a
-- migração 20260822_0058 (Fase 6.5, expansão do CHECK de food_source)
-- reconstruiu meal_plan_items do zero pra ampliar a constraint, mas o
-- CREATE TABLE novo e o INSERT de cópia esqueceram as colunas
-- quantity_locked/substitutions_locked (adicionadas antes, em
-- 20260821_0053_meal_plan_item_locks.sql) — elas foram silenciosamente
-- apagadas (coluna E dado) nessa reconstrução.
--
-- Efeito real: TODO createMealPlan/updateMealPlan desde então falha com
-- SQLITE_ERROR ("has no column named quantity_locked"), porque
-- buildMealPlanDetailStatements (lib/repositories/meal-plans.ts) sempre
-- inclui essas duas colunas no INSERT. Ou seja, nenhum plano alimentar
-- pôde ser salvo (criado ou editado) desde a Fase 6.5 nesta sessão —
-- descoberto ao testar manualmente "Criar por modelo" durante esta fase.
--
-- Restaura as colunas (aditivo, DEFAULT 0 = "não bloqueado", mesmo default
-- da migração original). O dado de lock que existia antes de 20260822_0058
-- não é recuperável (foi perdido na reconstrução, não só ocultado) — mas
-- como toda escrita subsequente falhava, nenhum plano criado/editado desde
-- então tem esse estado pra recuperar de qualquer forma.

ALTER TABLE meal_plan_items ADD COLUMN quantity_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meal_plan_items ADD COLUMN substitutions_locked INTEGER NOT NULL DEFAULT 0;
