-- FASE 1 (Canonical Nutrition Data Layer) — fundacao de dados para TBCA 7.3,
-- TACO e IBGE/POF 2008-2009, conforme docs/canonical-nutrition-model.md.
--
-- Aditivo e isolado: nenhuma tabela existente (custom_foods, food_portions,
-- food_catalog_usda_*, meal_plan_items, import_batches) e alterada. O Food
-- Resolver e o Nutrition Engine continuam lendo exatamente como hoje —
-- nenhuma dessas tabelas novas e consultada em runtime nesta fase.
--
-- import_batches (0050) ja cobre o "source registry" dinamico por execucao
-- (source, status, dataset_version, metadata_json com hash do arquivo) —
-- reaproveitado sem alteracao. food_sources abaixo e so o catalogo ESTATICO
-- (licenca/versao/URL), dimensao diferente de "rodei uma importacao".
--
-- Fase 2 (mesmo dia): CHECK de nutrient_code ampliado com 9 codigos novos
-- (ADDED_SUGAR/ADDED_SALT/ADDED_FAT/PLANT_PROTEIN/ANIMAL_PROTEIN/
-- LINOLEIC_ACID/ALPHA_LINOLENIC_ACID/EPA/DHA — ver auditoria em
-- reports/nutrient-unmapped-inventory.md). Editado NO MESMO arquivo em vez
-- de uma migration nova porque esta migration nunca foi aplicada a nenhum
-- D1 real (Fase 1 nao fez deploy) — nao ha dado migrado para preservar.
--
-- canonical_nutrients NAO existe como tabela: nutrient_code aponta direto
-- para o vocabulario ja existente em lib/nutrition/nutrient-vocabulary.ts
-- (NutrientCode), via CHECK inline com os mesmos 34 codigos — nunca um
-- segundo vocabulario paralelo. Se um novo NutrientCode for adicionado la,
-- este CHECK precisa ser atualizado numa migration futura (aditiva).

CREATE TABLE IF NOT EXISTS food_sources (
  id TEXT PRIMARY KEY,                    -- 'TBCA' | 'TACO' | 'IBGE_POF'
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  license_name TEXT NULL,
  license_url TEXT NULL,
  redistribution_restricted INTEGER NOT NULL DEFAULT 0,
  source_url TEXT NULL,
  accessed_at TEXT NOT NULL
);

INSERT OR IGNORE INTO food_sources (id, name, version, license_name, license_url, redistribution_restricted, source_url, accessed_at) VALUES
  ('TBCA', 'Tabela Brasileira de Composição de Alimentos — TBCA', '7.3',
   'Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International (CC BY-NC-ND 4.0)',
   'https://creativecommons.org/licenses/by-nc-nd/4.0/deed.pt_BR', 1, 'https://www.tbca.net.br/', '2026-08-22'),
  ('TACO', 'Tabela Brasileira de Composição de Alimentos — TACO', '4ª edição revisada e ampliada (2011)',
   'Permissão de reprodução com citação da fonte',
   'https://cfn.org.br/wp-content/uploads/2017/03/taco_4_edicao_ampliada_e_revisada.pdf', 0,
   'https://nepa.unicamp.br/publicacoes/tabela-taco-excel/', '2026-08-21'),
  ('IBGE_POF', 'IBGE — POF 2008–2009: Tabelas de Composição Nutricional dos Alimentos Consumidos no Brasil', '2008–2009',
   'Publicação oficial do IBGE — verificar condições aplicáveis de redistribuição',
   'https://www.ibge.gov.br/', 0, 'https://biblioteca.ibge.gov.br/visualizacao/livros/liv50002.pdf', '2026-08-21');

-- Um alimento por fonte+colecao (NUNCA deduplicado entre TBCA/TACO/POF —
-- ver "Estrategia de deduplicacao" do modelo canonico).
CREATE TABLE IF NOT EXISTS canonical_foods (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL REFERENCES food_sources(id),
  source_version TEXT NOT NULL,
  source_food_id TEXT NOT NULL,
  source_collection TEXT NULL,             -- so TBCA: distingue as 4 sub-collections importadas
  name TEXT NOT NULL,
  scientific_name TEXT NULL,
  normalized_name TEXT NOT NULL,           -- normalize() puro (sem stopwords), para busca/dedup DENTRO da fonte
  basis TEXT NOT NULL CHECK (basis IN ('per_100g_food', 'per_100g_edible_portion', 'per_100g_fatty_acids', 'per_100ml')),
  classification_group TEXT NULL,
  classification_food_type TEXT NULL,
  preparation_method TEXT NULL,            -- extraido do nome (TBCA/TACO) via extractPreparation()
  preparation_code TEXT NULL,              -- estruturado na fonte (POF: preparation.code)
  preparation_name TEXT NULL,              -- estruturado na fonte (POF: preparation.name)
  source_detail_url TEXT NULL,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, source_food_id, source_collection)
);

CREATE INDEX IF NOT EXISTS canonical_foods_name_idx ON canonical_foods(normalized_name);
CREATE INDEX IF NOT EXISTS canonical_foods_source_idx ON canonical_foods(source, source_collection);
CREATE INDEX IF NOT EXISTS canonical_foods_classification_idx ON canonical_foods(classification_group, classification_food_type);

-- Long-format: um valor por (alimento, nutriente-da-fonte, [medida]). E a
-- unica tabela que a Fase futura de leitura pelo Nutrition Engine consultaria
-- (nao consultada em runtime nesta fase). nutrient_code aponta pro vocabulario
-- existente; NULL = nutriente da fonte ainda sem NutrientCode equivalente
-- ("unmapped" e um eixo separado de status: nunca inventamos um mapping so
-- pra evitar NULL aqui).
CREATE TABLE IF NOT EXISTS food_nutrient_values (
  id TEXT PRIMARY KEY,
  canonical_food_id TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  nutrient_code TEXT NULL CHECK (nutrient_code IS NULL OR nutrient_code IN (
    'ENERGY_KCAL','ENERGY_KJ','PROTEIN','CARBOHYDRATE','SUGARS','TOTAL_FAT','SATURATED_FAT',
    'MONOUNSATURATED_FAT','POLYUNSATURATED_FAT','TRANS_FAT','FIBER','SODIUM','CALCIUM','IRON',
    'MAGNESIUM','PHOSPHORUS','POTASSIUM','ZINC','COPPER','MANGANESE','SELENIUM','VITAMIN_A',
    'VITAMIN_C','VITAMIN_D','VITAMIN_E','VITAMIN_K','THIAMIN','RIBOFLAVIN','NIACIN',
    'PANTOTHENIC_ACID','VITAMIN_B6','FOLATE','VITAMIN_B12','CHOLESTEROL',
    'ADDED_SUGAR','ADDED_SALT','ADDED_FAT','PLANT_PROTEIN','ANIMAL_PROTEIN',
    'LINOLEIC_ACID','ALPHA_LINOLENIC_ACID','EPA','DHA'
  )),
  source_nutrient_id TEXT NOT NULL,        -- chave normativa da fonte (nunca o "name" solto) — ex.: 'taco:proteina', 'tbca:sodio:mg'
  source TEXT NOT NULL REFERENCES food_sources(id),
  source_food_id TEXT NOT NULL,            -- denormalizado para query/auditoria sem join
  source_record_id TEXT NULL,              -- id do sub-registro na fonte quando aplicavel (ex.: portion_id da TBCA)
  value REAL NULL,
  unit TEXT NOT NULL,                      -- unidade canonica normalizada (kcal|kJ|g|mg|mcg) ou unidade original quando nao reconhecida
  raw_unit TEXT NULL,                      -- unidade EXATAMENTE como veio da fonte, antes de normalizar (ex.: '(g)', 'Kcal', 'ug')
  basis TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reported', 'trace', 'missing', 'not_applicable', 'unparsed')),
  raw_value TEXT NULL,
  portion_id TEXT NULL REFERENCES canonical_food_portions(id) ON DELETE CASCADE,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (canonical_food_id, source_nutrient_id, portion_id)
);

CREATE INDEX IF NOT EXISTS food_nutrient_values_food_idx ON food_nutrient_values(canonical_food_id);
CREATE INDEX IF NOT EXISTS food_nutrient_values_nutrient_idx ON food_nutrient_values(nutrient_code);
CREATE INDEX IF NOT EXISTS food_nutrient_values_unmapped_idx ON food_nutrient_values(source, source_nutrient_id) WHERE nutrient_code IS NULL;
CREATE INDEX IF NOT EXISTS food_nutrient_values_batch_idx ON food_nutrient_values(import_batch_id);

-- Medidas caseiras. Guarda o valor estruturado da fonte (source_measure_*) e
-- o valor extraido heuristicamente do rotulo (parsed_label_grams) como
-- colunas DISTINTAS e NUNCA colapsadas uma na outra (Fase 6): rotulo dizendo
-- "(370 g)" com measure.raw="M" preserva as duas informacoes lado a lado.
CREATE TABLE IF NOT EXISTS canonical_food_portions (
  id TEXT PRIMARY KEY,
  canonical_food_id TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  source TEXT NOT NULL REFERENCES food_sources(id),
  source_food_id TEXT NOT NULL,
  source_portion_id TEXT NULL,             -- id da medida na fonte (ex.: 'tbca_portion_0')
  label TEXT NOT NULL,
  source_measure_quantity REAL NULL,       -- measure.quantity estruturado da fonte, nunca inferido
  source_measure_unit TEXT NULL,           -- measure.unit estruturado da fonte ('g' | 'ml' | ...), nunca inferido
  source_measure_raw TEXT NULL,            -- measure.raw literal da fonte (ex.: '45 g', 'M')
  parsed_label_grams REAL NULL,            -- extraido heuristicamente do texto do label (ex.: '(370 g)') — SEMPRE distinto de source_measure_*
  gram_weight REAL NULL,                   -- so preenchido quando weight_source = 'structured_quantity' E unit e grama
  ml_weight REAL NULL,                     -- so preenchido quando weight_source = 'structured_quantity' E unit e mL
  weight_source TEXT NOT NULL CHECK (weight_source IN ('structured_quantity', 'parsed_from_label', 'unknown')),
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, source_food_id, source_portion_id)
);

CREATE INDEX IF NOT EXISTS canonical_food_portions_food_idx ON canonical_food_portions(canonical_food_id);

-- Estatistica (mean/sd/min/max/n) SEPARADA dos valores clinicos normais —
-- decisao explicita desta fase (a versao anterior do doc embutia essas
-- colunas em food_nutrient_values; aqui o pedido pede tabela propria).
-- Preenchida so a partir de composicao_informacao_estatistica /
-- composicao_informacao_estatistica_produtos da TBCA, ligada por
-- canonical_food_id (join por source_food_id identico contra a colecao
-- principal, confirmado por leitura direta do arquivo real — nao e um
-- "match assistido", e o mesmo ID literal nas duas colecoes).
CREATE TABLE IF NOT EXISTS nutrient_statistics (
  id TEXT PRIMARY KEY,
  canonical_food_id TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  nutrient_code TEXT NULL CHECK (nutrient_code IS NULL OR nutrient_code IN (
    'ENERGY_KCAL','ENERGY_KJ','PROTEIN','CARBOHYDRATE','SUGARS','TOTAL_FAT','SATURATED_FAT',
    'MONOUNSATURATED_FAT','POLYUNSATURATED_FAT','TRANS_FAT','FIBER','SODIUM','CALCIUM','IRON',
    'MAGNESIUM','PHOSPHORUS','POTASSIUM','ZINC','COPPER','MANGANESE','SELENIUM','VITAMIN_A',
    'VITAMIN_C','VITAMIN_D','VITAMIN_E','VITAMIN_K','THIAMIN','RIBOFLAVIN','NIACIN',
    'PANTOTHENIC_ACID','VITAMIN_B6','FOLATE','VITAMIN_B12','CHOLESTEROL',
    'ADDED_SUGAR','ADDED_SALT','ADDED_FAT','PLANT_PROTEIN','ANIMAL_PROTEIN',
    'LINOLEIC_ACID','ALPHA_LINOLENIC_ACID','EPA','DHA'
  )),
  source_nutrient_id TEXT NOT NULL,        -- id/tagname da fonte (ex.: 'tbca:enerc:kcal', tagname 'ENERC')
  source_tagname TEXT NULL,
  source TEXT NOT NULL REFERENCES food_sources(id),
  source_food_id TEXT NOT NULL,
  mean_value REAL NULL,
  mean_status TEXT NOT NULL DEFAULT 'missing' CHECK (mean_status IN ('reported', 'trace', 'missing', 'not_applicable', 'unparsed')),
  standard_deviation REAL NULL,
  minimum REAL NULL,
  maximum REAL NULL,
  number_of_observations INTEGER NULL,
  data_type TEXT NULL,                     -- 'Calculado' | 'Analisado' | 'Estimado' etc., literal da fonte
  references_text TEXT NULL,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (canonical_food_id, source_nutrient_id)
);

CREATE INDEX IF NOT EXISTS nutrient_statistics_food_idx ON nutrient_statistics(canonical_food_id);

-- Aliases DENTRO da mesma fonte (colisao de nome normalizado) — nunca
-- matching entre fontes (isso e food_match_candidates, abaixo).
CREATE TABLE IF NOT EXISTS food_aliases (
  id TEXT PRIMARY KEY,
  canonical_food_id TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  alias_type TEXT NOT NULL CHECK (alias_type IN ('spelling', 'regional', 'abbreviation', 'search_synonym')),
  source TEXT NOT NULL CHECK (source IN ('curated', 'derived_from_normalization')),
  -- Fase 3.5 (mesmo dia, editado no mesmo arquivo pelo mesmo motivo das
  -- alteracoes da Fase 2: esta migration nunca foi aplicada a nenhum D1
  -- real): nivel de confianca de CADA alias, exigido pelo relatorio de
  -- aliases (reports/canonical-food-aliases.*). Nunca abaixo destes 3.
  confidence TEXT NOT NULL DEFAULT 'MANUAL_CURATED' CHECK (confidence IN ('EXACT_NORMALIZATION', 'SAFE_VARIANT', 'MANUAL_CURATED')),
  reason TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (canonical_food_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS food_aliases_alias_idx ON food_aliases(normalized_alias);

-- Candidatos de equivalencia ENTRE fontes — SUGESTAO apenas, nunca aplicada
-- automaticamente. Nenhum outro processo le esta tabela para decidir valor
-- nutricional; existe so para uma futura UI "ver esta comida em outra fonte".
CREATE TABLE IF NOT EXISTS food_match_candidates (
  id TEXT PRIMARY KEY,
  canonical_food_id_a TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  canonical_food_id_b TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  match_basis TEXT NOT NULL CHECK (match_basis IN ('normalized_name_exact', 'all_tokens_present')),
  match_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'confirmed', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (canonical_food_id_a, canonical_food_id_b)
);

CREATE INDEX IF NOT EXISTS food_match_candidates_a_idx ON food_match_candidates(canonical_food_id_a);
CREATE INDEX IF NOT EXISTS food_match_candidates_b_idx ON food_match_candidates(canonical_food_id_b);

-- FTS — mesmo padrao ja usado para o catalogo USDA (0049): tabela virtual
-- populada pelo proprio importador, nao por trigger.
CREATE VIRTUAL TABLE IF NOT EXISTS canonical_foods_fts USING fts5(
  food_id UNINDEXED,
  name,
  normalized_name,
  scientific_name,
  classification,
  preparation,
  source_food_id,
  tokenize = 'unicode61'
);
