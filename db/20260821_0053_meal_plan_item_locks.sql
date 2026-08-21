-- Locks de item (seções 4-5 do pedido de fechamento de gaps): "manter
-- quantidade" e "não sugerir substituições" por item, mais "bloquear
-- refeição" (aplicado a todos os itens dela). Reaproveita o MESMO conceito
-- de lock já usado pelo Optimizer V2 (que hoje só recebe lockedItemKeys/
-- lockedMealKeys como parâmetro por chamada, sem persistência) — agora
-- persistido no próprio item, então tanto o optimizer quanto a sugestão de
-- substituições podem derivar a lista de itens bloqueados automaticamente
-- do estado salvo do plano, em vez de exigir seleção manual a cada chamada.

ALTER TABLE meal_plan_items ADD COLUMN quantity_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meal_plan_items ADD COLUMN substitutions_locked INTEGER NOT NULL DEFAULT 0;
