# Meal Plan Reuse & Templates R4 — Schema e Templates

## Migration aplicada

`db/20260827_0070_meal_plan_reuse_favorites.sql` — 3 tabelas aditivas, 0
`ALTER TABLE` em tabela existente:

```sql
CREATE TABLE IF NOT EXISTS admin_food_usage (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  food_source TEXT NOT NULL CHECK (food_source IN ('TACO','CUSTOM','MANUFACTURER','USDA')),
  food_ref_id TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (admin_id, food_source, food_ref_id),
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);
CREATE INDEX idx_admin_food_usage_recent ON admin_food_usage(admin_id, last_used_at DESC);

CREATE TABLE IF NOT EXISTS admin_food_favorites (
  id TEXT PRIMARY KEY, admin_id TEXT NOT NULL,
  food_source TEXT NOT NULL CHECK (...), food_ref_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (admin_id, food_source, food_ref_id),
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);
CREATE INDEX idx_admin_food_favorites_admin ON admin_food_favorites(admin_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_saved_meals (
  id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, name TEXT NOT NULL,
  meal_structure TEXT NOT NULL DEFAULT 'SIMPLE' CHECK (meal_structure IN ('SIMPLE','OPTIONS','COMBINATION')),
  content TEXT NOT NULL, usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);
CREATE INDEX idx_admin_saved_meals_admin ON admin_saved_meals(admin_id, updated_at DESC);
```

- `npm run migrate:d1:check`: PASS.
- `npm run schema:runtime-check` (bloqueia DDL fora de migration): PASS.
- Rollback: `DROP TABLE` de cada uma — nenhuma outra tabela referencia estas
  três, nenhum impacto em `meal_plans`/versionamento.

## MEAL_TEMPLATE vs. PLAN_TEMPLATE (seção 26)

Mantidos como tipos distintos, nunca unificados:

- **PLAN_TEMPLATE** = `protocol_templates` (já existente, admin-autorável,
  escopado por `target_group`, com estrutura completa
  `diet_template_meals/items/substitutions/supplements`). R4 só adicionou
  a rota de LEITURA `GET /api/admin/protocol-templates/[id]/meals`
  (reaproveitando `getRelationalDietTemplates`) para permitir aplicar um
  modelo ESPECÍFICO (por nome, não só por `target_group`) direto no draft
  atual — o "Salvar como modelo" (plano→template) e a criação por
  `target_group` já existiam e não foram tocados.
- **MEAL_TEMPLATE** = `admin_saved_meals` (novo). Uma refeição isolada,
  reutilizável em QUALQUER plano futuro, independente de população-alvo.

## Conteúdo do template nunca é autoridade nutricional (seção 27)

`admin_saved_meals.content` guarda `name/meal_structure/items/options/
choice_groups` — a mesma forma de `meal_plans.meals` — com identidade
canônica (`food_source`/`food_ref_id`/`canonical_food_id`) e quantidade,
mas SEM `nutrition_snapshot`/`food_name_snapshot`/locks/proveniência de
slot (`sanitizeMealForSaving` em `lib/repositories/admin-saved-meals.ts`
remove tudo isso explicitamente antes de persistir). Ao aplicar
(`applySavedMeal`), o resultado entra no draft local sem nenhum `id` —
igual a "duplicar refeição" — e a Nutrition Engine recalcula tudo a partir
da identidade canônica, nunca de um valor congelado.

## Metadados (seção 28)

`admin_saved_meals` guarda `name`, `created_at`, `updated_at`,
`usage_count` (incrementado via `POST /api/admin/saved-meals/[id]` toda vez
que a refeição é efetivamente aplicada). Sem `description`/`tags/category`
nesta fase — não havia necessidade demonstrada de categorização adicional
além do nome, e a seção 28 do pedido já marca esses campos como
"somente se infraestrutura permitir" (opcional). Sem categorização clínica
automática por IA (seção 29) — nunca implementada, nem cogitada.

## Preview antes de aplicar (seção 30)

- Refeições salvas: o card na biblioteca já mostra nome + contagem de itens
  + tipo de estrutura antes do clique de aplicar.
- Modelos de plano: nome + `target_group` visível na lista; a prescrição
  completa só é buscada (`GET .../meals`) no momento de aplicar — decisão
  deliberada de performance (ver relatório de performance): buscar a
  prescrição completa de TODOS os modelos listados só para exibir um
  preview mais rico não se justificava para o volume observado, e o
  aplicar continua reversível (nunca auto-save).

## Aplicar não faz auto-save (seção 31)

Toda inserção (refeição salva, refeição copiada, refeições de um modelo de
plano) usa exatamente o mesmo padrão já usado por "Inserir receita"
(`insertRecipe`) — `onChange([...meals, meal])` no estado LOCAL do
Composer. Nada é persistido até a nutricionista clicar em "Salvar
rascunho", igual a qualquer outra edição manual.
