-- FASE 8.5 (item 2) — o slot do template precisa sobreviver como um
-- CONTRATO FUNCIONAL no item do plano, não só metadado solto: além de
-- slot_food_group/slot_food_subgroup/slot_nutritional_role (Fase 8), o item
-- agora carrega o id do slot de origem (proveniência auditável, igual
-- template_id/template_version em meal_plans) e se aquele slot é elegível
-- pra geração automática de substituições/grupo de troca (item 9 — água,
-- tempero, suplemento específico etc. normalmente NÃO são).

ALTER TABLE meal_plan_items ADD COLUMN template_slot_id TEXT;
ALTER TABLE meal_plan_items ADD COLUMN slot_exchange_eligible INTEGER;
