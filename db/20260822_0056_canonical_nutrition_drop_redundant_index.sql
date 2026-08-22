-- FASE 4.5 (item 8) — food_nutrient_values_food_idx(canonical_food_id) é
-- redundante: a UNIQUE (canonical_food_id, source_nutrient_id, portion_id)
-- já cria um autoíndice cujo prefixo (canonical_food_id) cobre exatamente
-- a mesma busca — confirmado via EXPLAIN QUERY PLAN contra o D1 real, que
-- escolhe sqlite_autoindex_food_nutrient_values_2 e nunca o índice
-- explícito. Remove só o índice redundante; nenhuma linha/coluna/tabela
-- muda, nenhum dado é perdido — DROP INDEX só remove a estrutura auxiliar.
-- migration:allow-destructive
DROP INDEX IF EXISTS food_nutrient_values_food_idx;
