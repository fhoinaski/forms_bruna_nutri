-- R6 (seções 15-21) — contrato de rendimento (yield) explícito para
-- receitas. `yield_mode` distingue a base técnica usada para densidade
-- nutricional por grama:
--   RAW_TOTAL       — soma das gramas dos ingredientes (nenhum rendimento
--                     final informado; base técnica, não medida real).
--   USER_REPORTED   — a nutricionista informou a massa final real
--                     ("rendeu 800g") em `yield_grams`.
--   PORTION_COUNT   — só a contagem de porções é conhecida (`servings`,
--                     coluna já existente), sem massa alguma — item de
--                     receita só pode ser quantificado em porções, nunca
--                     em g/ml (seção 18-21).
-- NULL (linhas existentes, criadas antes desta fase) é tratado pelo
-- código como RAW_TOTAL por padrão (nenhuma migração de dado necessária:
-- ingredientes antigos já tinham `grams`, então a soma bruta continua
-- válida como base técnica) — nunca reescrito aqui.
-- migration:allow-destructive

ALTER TABLE recipes ADD COLUMN yield_mode TEXT NULL
  CHECK (yield_mode IS NULL OR yield_mode IN ('RAW_TOTAL', 'USER_REPORTED', 'PORTION_COUNT'));

-- Só populado quando yield_mode = 'USER_REPORTED' — a massa final real
-- informada pela nutricionista. NULL em qualquer outro modo (nunca um
-- fator de cocção inventado — seção 17).
ALTER TABLE recipes ADD COLUMN yield_grams REAL NULL;
