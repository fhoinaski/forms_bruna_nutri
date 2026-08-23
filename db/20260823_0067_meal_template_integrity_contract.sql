-- R2 — System meal template integrity contract.
-- Additive columns only: existing templates/plans remain readable, while
-- SYSTEM READY templates can persist meal context and food identity.

ALTER TABLE diet_template_meals ADD COLUMN meal_context TEXT;
ALTER TABLE meal_plan_meals ADD COLUMN meal_context TEXT;

ALTER TABLE diet_template_items ADD COLUMN food_source TEXT NULL CHECK (food_source IS NULL OR food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER', 'USDA', 'TBCA', 'IBGE_POF'));
ALTER TABLE diet_template_items ADD COLUMN food_ref_id TEXT NULL;
ALTER TABLE diet_template_items ADD COLUMN canonical_food_id TEXT NULL;

ALTER TABLE diet_template_slot_foods ADD COLUMN food_source TEXT NULL CHECK (food_source IS NULL OR food_source IN ('TACO', 'CUSTOM', 'MANUFACTURER', 'USDA', 'TBCA', 'IBGE_POF'));
ALTER TABLE diet_template_slot_foods ADD COLUMN food_ref_id TEXT NULL;
ALTER TABLE diet_template_slot_foods ADD COLUMN canonical_food_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_diet_template_meals_context
ON diet_template_meals(template_id, meal_context);

CREATE INDEX IF NOT EXISTS idx_diet_template_items_identity
ON diet_template_items(food_source, food_ref_id);

CREATE INDEX IF NOT EXISTS idx_diet_template_slot_foods_identity
ON diet_template_slot_foods(food_source, food_ref_id);

-- Do not keep non-audited clinical prescriptions active as SYSTEM meal
-- templates. They remain preserved for history/maintenance and can be
-- reactivated when authored with explicit identity, role and calculability.
UPDATE protocol_templates
SET is_active = 0,
    is_default = 0,
    updated_at = '2026-08-23T00:00:00.000Z'
WHERE template_origin = 'SYSTEM'
  AND type = 'DIETA'
  AND target_group <> 'ADULTO_SAUDAVEL';
