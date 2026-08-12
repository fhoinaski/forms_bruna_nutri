-- FASE 3 — Precisão nutricional e medidas caseiras.
--
-- Tudo aditivo: nenhuma coluna existente muda de tipo ou é removida, nenhum
-- CHECK existente é alterado. Migration incremental sobre 0034 (não editada,
-- conforme instrução do pedido) — 0034 criou food_portions sem os campos de
-- proveniência/confiança/ativação necessários para o motor central de
-- resolução de quantidade (lib/nutrition/quantity-resolution.ts).

-- source_version: versão/data da fonte de onde a medida veio (ex.: "TBCA 7ª
-- edição", "2024-01"), para permitir revisar/atualizar no futuro sem
-- confundir com a coluna `source` (nome da fonte). Nula para as 6 linhas-
-- semente existentes (não sabemos a versão exata da referência de mercado
-- usada) e para qualquer medida futura sem essa informação disponível.
ALTER TABLE food_portions ADD COLUMN source_version TEXT NULL;

-- confidence: toda medida sabe o quão confiável ela é (seção 6 do pedido).
-- As 6 linhas-semente já existentes são referências de mercado comuns, não
-- dado oficial publicado — ficam 'medium' por padrão (nem 'high' fingindo
-- precisão oficial, nem 'low' como uma estimativa genérica sem nenhuma
-- pesquisa). Medidas cadastradas pela nutricionista entram como 'medium' por
-- padrão também (ela pesou o alimento, mas não é uma fonte oficial
-- publicada) — o admin pode ajustar.
ALTER TABLE food_portions ADD COLUMN confidence TEXT NOT NULL DEFAULT 'medium'
  CHECK (confidence IN ('high', 'medium', 'low'));
UPDATE food_portions SET confidence = 'medium' WHERE source = 'Referência de mercado comum';

-- is_active: permite desativar uma medida sem quebrar itens de plano que já
-- a referenciam via household_measure_id (nunca DELETE — preserva o
-- histórico de cálculo de planos já salvos).
ALTER TABLE food_portions ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS food_portions_active_idx ON food_portions(food_source, food_ref_id, is_active);

-- Vínculo estruturado do item à medida caseira escolhida (seção 12 do
-- pedido) — quando presente, tem prioridade máxima na resolução de
-- quantidade, independente do texto livre em `unit`. Nulo = item legado ou
-- sem medida específica selecionada (cai para a conversão genérica/estimada
-- já existente, agora marcada explicitamente como estimativa — ver
-- lib/nutrition/quantity-resolution.ts). Sem FK declarada (D1/SQLite não
-- aplica FK entre ALTER TABLEs de migrations diferentes de forma
-- confiável neste projeto — mesmo padrão já usado para food_ref_id em
-- 0034), validado em código.
ALTER TABLE meal_plan_items ADD COLUMN household_measure_id TEXT NULL;
