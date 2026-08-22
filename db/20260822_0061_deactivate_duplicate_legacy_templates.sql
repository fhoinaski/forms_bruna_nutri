-- FASE 8 (auditoria de templates, item 2/17) — desativa 11 templates
-- legados duplicados encontrados na auditoria: para SOP, VEGETARIANO_ESTRITO,
-- ENDURANCE e RESISTENCIA_INSULINA existiam DOIS conjuntos de templates
-- DIETA/SUBSTITUICAO/SUPLEMENTACAO para o mesmo target_group — o conjunto
-- canônico atual (tpl-{grupo}-{tipo}-base, com dados relacionais reais em
-- diet_template_meals/items) e um conjunto legado anterior
-- (tpl_{grupo}_{tipo}_01, sem nenhuma linha em diet_template_meals, só um
-- JSON legado na coluna content).
--
-- Isso não é só redundância inofensiva: `createMealPlanFromTemplates`
-- (lib/repositories/meal-plans.ts) busca TODOS os templates ativos do tipo
-- DIETA para o target_group e, quando um template não tem refeições
-- relacionais, cai para extractMeals(parseJson(content)) como fallback —
-- então para estes 4 grupos, "Criar por modelo" hoje soma as refeições
-- relacionais do template canônico COM as refeições extraídas do JSON
-- legado do template duplicado, duplicando refeições e suplementos no
-- plano gerado. Nunca deletamos os templates legados (podem ter sido
-- referenciados/lidos em algum lugar) — só desativamos (is_active = 0),
-- removendo-os do fallback ativo sem perder o histórico.

UPDATE protocol_templates
SET is_active = 0, updated_at = updated_at
WHERE id IN (
  'tpl_sop_dieta_01', 'tpl_sop_subs_01', 'tpl_sop_supl_01',
  'tpl_veg_dieta_01', 'tpl_veg_subs_01', 'tpl_veg_supl_01',
  'tpl_endurance_dieta_01', 'tpl_endurance_subs_01', 'tpl_endurance_supl_01',
  'tpl_res_insul_dieta_01', 'tpl_res_insul_supl_01'
);
