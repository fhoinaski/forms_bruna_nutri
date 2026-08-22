# Fase 8 — Auditoria e migração dos templates existentes pro modelo estruturado

## 1. Onde os templates existiam (auditoria, item 1)

Templates de plano alimentar **já existiam** como um sistema relacional real, não como texto livre:

- `protocol_templates` (id, type ∈ {DIETA, SUPLEMENTACAO, SUBSTITUICAO}, target_group, title, content JSON legado, is_active, notes) — 14 grupos no CHECK constraint.
- `diet_template_meals` → `diet_template_items` (refeições e alimentos com quantidade/unidade fixas).
- `diet_template_substitutions`, `diet_template_supplements`.
- UI de CRUD completa em `/dashboard/templates` (`app/dashboard/templates/page.tsx`).
- "Criar por modelo" (`components/dashboard/MealPlanEditor.tsx`) → `POST /api/admin/clients/[id]/meal-plans` → `createMealPlanFromTemplates` (`lib/repositories/meal-plans.ts`) — copia as refeições/itens do(s) template(s) DIETA do grupo pra um novo plano (cópia desacoplada, sem FK).
- `meal_plans.target_group` é só uma TEXT nullable (sem FK) — a ligação real de conteúdo é via `target_group` string, nunca um id de template.
- Templates personalizados **já existiam**: `saveMealPlanAsDietTemplate` promove um plano salvo em novo `protocol_templates` — havia 1 real em produção (`98832006-...`, "Plano alimentar - adulto saudavel - modelo").

**Nenhuma biblioteca paralela foi criada.** Os 45 registros de `protocol_templates` existentes continuam sendo os únicos templates do sistema — todos os IDs, títulos e conteúdo legado foram preservados.

## 2. Gap real encontrado, não assumido (item 1)

Auditoria em produção (D1 real) encontrou:

- **11 dos 14 grupos têm template DIETA ativo.** `BARIATRICO`, `RENAL` e `ONCOLOGICO` **nunca tiveram nenhum template cadastrado** (0 linhas em `protocol_templates` pra esses 3 grupos, apesar de estarem no enum/dropdown desde a Fase 6.5).
- **11 templates legados duplicados** (`tpl_sop_dieta_01`, `tpl_veg_dieta_01`, `tpl_endurance_dieta_01`, `tpl_res_insul_dieta_01` + suas variantes de substituição/suplementação) — um conjunto anterior, sem nenhuma linha relacional (`diet_template_meals` vazia), com o conteúdo só no JSON legado (`content`, 400–2000 bytes).
- **Bug real de produção causado por essa duplicata:** `createMealPlanFromTemplates` busca TODOS os templates DIETA ativos do grupo; quando um não tem refeições relacionais, cai pro `content` JSON como fallback. Pra SOP/VEGETARIANO_ESTRITO/ENDURANCE/RESISTENCIA_INSULINA isso significava que "Criar por modelo" **somava** as refeições do template canônico com as do template legado duplicado — refeições e suplementos apareciam dobrados no plano criado.

## 3. Ações tomadas (não fabricação de conteúdo clínico)

| Grupo | Ação |
|---|---|
| 11 grupos com template real | Migrados pro modelo de slots (seção 5) |
| SOP/VEGETARIANO_ESTRITO/ENDURANCE/RESISTENCIA_INSULINA | Os 11 templates legados duplicados foram **desativados** (`is_active=0`, nunca deletados) — corrige o bug de duplicação real |
| BARIATRICO/RENAL/ONCOLOGICO | **Nenhum conteúdo inventado.** Nenhum desses grupos tinha um template pra "reescrever" — criar um do zero seria fabricar protocolo clínico sem revisão de nutricionista, o oposto do que a Fase 7/8 pede. "Criar por modelo" pra esses 3 grupos agora falha explicitamente (HTTP 422, mensagem clara) em vez de criar silenciosamente um plano vazio |

## 4. Modelo novo (item 3) — aditivo, nunca substituindo

Duas tabelas novas, aditivas, penduradas em `diet_template_meals` (já existente):

```
diet_template_slots       (meal_id FK, food_group, food_subgroup, nutritional_role,
                            required, exchange_eligible, min_items, max_items, sort_order)
diet_template_slot_foods  (slot_id FK, food, quantity NULL, unit NULL, source_item_id, sort_order)
```

`diet_template_items` (a estrutura antiga) **continua existindo e intocada** — é o que a UI de CRUD atual (`/dashboard/templates`) já edita. Os slots são uma camada de leitura adicional sobre os MESMOS dados, não uma tabela paralela de templates.

Formato exposto (`getTemplateStructure`, `GET /api/admin/protocol-templates/[id]/structure`):

```jsonc
{
  "id": "tpl-adulto_saudavel-dieta-base",
  "name": "Dieta base - adulto saudavel",
  "category": "ADULTO_SAUDAVEL",
  "clinicalRiskLevel": "low",
  "requiresProfessionalReview": false,
  "version": 4,
  "structureVersion": "v2",
  "meals": [
    { "name": "Almoco", "suggestedTime": "",
      "slots": [
        { "foodGroup": "CARBOHYDRATE", "foodSubgroup": "GRAIN", "nutritionalRole": "STARCH_SOURCE",
          "required": true, "exchangeEligible": true, "minItems": 1, "maxItems": 1,
          "suggestedFoods": [{ "food": "Arroz integral cozido", "quantity": "120", "unit": "g" }] },
        { "foodGroup": "PROTEIN", "foodSubgroup": "POULTRY", "nutritionalRole": "LEAN_PROTEIN", ... }
      ] }
  ]
}
```

## 5. Sem prescrição fixa (item 4) — alimentos viram sugestão, não obrigação

`quantity`/`unit` em `diet_template_slot_foods` são **opcionais** — o alimento específico que já existia (ex.: "Arroz integral cozido") virou uma `suggestedFood` DENTRO do slot `CARBOHYDRATE/GRAIN`, nunca a regra em si. Nada foi apagado: os 118 `diet_template_items` originais continuam intactos; o backfill (`scripts/backfill-template-slots.ts`) só leu e classificou, nunca deletou.

## 6. Classificação: motor reaproveitado, 3 bugs reais corrigidos no processo

Reaproveitei `classifyFoodExchangeGroup` (Fase 7, `lib/nutrition/food-exchange-hierarchy.ts`) — nunca uma segunda lógica. Rodar o classificador contra os 118 itens de template REAIS (não os fixtures sintéticos da Fase 7) expôs 3 bugs genuínos, corrigidos e cobertos por teste de regressão:

1. **Ordem EGG vs POULTRY**: "Ovo de galinha inteiro cozido" caía em POULTRY (contém "galinha") antes de checar "ovo" — reordenado, EGG agora vem primeiro.
2. **Keyword curta demais**: `"ave"` (POULTRY) é substring de "av**e**ia" — "Aveia em flocos" virava PROTEIN/POULTRY. Removida.
3. **FRUIT/VEGETABLE sem `nameKeywords`**: essas duas regras só tinham `groupKeywords` (dependiam de bater no campo `grupo` real da TACO). Itens de template como "Banana prata"/"Couve refogada" (sem correspondência exata no catálogo) caíam inteiro em `OTHER/MIXED_ROLE`. Adicionei listas de `nameKeywords` reais.

Resultado final (real, produção): **118/118 alimentos-sugestão classificados**, apenas 5 ficaram em `OTHER/MIXED_ROLE` — todos genuinamente ambíguos (whey protein ×3, proteína isolada de ervilha, geleia de fruta), não bugs.

## 7. BUG CRÍTICO PRÉ-EXISTENTE encontrado e corrigido (fora do escopo original, mas bloqueava tudo)

Ao testar manualmente "Criar por modelo" pela primeira vez nesta sessão, toda chamada retornava **HTTP 500**. Investigação: a migração `20260822_0058` (Fase 6.5, expansão do CHECK de `food_source`, executada mais cedo nesta mesma sessão) reconstruiu `meal_plan_items` do zero pra ampliar a constraint — mas o `CREATE TABLE`/`INSERT` de cópia **esqueceu as colunas `quantity_locked`/`substitutions_locked`**, apagando-as silenciosamente (coluna e dado).

**Efeito real: nenhum plano alimentar pôde ser criado ou editado (createMealPlan/updateMealPlan) desde aquela migração até agora.** Corrigido com uma migração aditiva (`20260822_0063`) restaurando as duas colunas (`DEFAULT 0`). Verificado ao vivo: "Criar por modelo" voltou a funcionar (HTTP 201) para o cliente real testado.

## 8. Proveniência (item 13) — carimbada, nunca retroativa

`meal_plans` ganhou `template_id`/`template_version` (aditivo, nullable). `createMealPlanFromTemplates` carimba a identidade do template quando existe **exatamente 1** template DIETA ativo pro grupo. Verificado em produção: as **16 linhas de `meal_plans` existentes continuam com `template_id = NULL`** — nenhum plano histórico foi alterado.

**Limitação real, documentada e não corrigida nesta fase:** `ADULTO_SAUDAVEL` tem 2 templates DIETA ativos hoje (o canônico + o personalizado `98832006-...`). Quando isso acontece, `createMealPlanFromTemplates` combina as refeições dos dois (comportamento pré-existente, não alterado por esta fase) e `template_id` fica `NULL` por ambiguidade — coberto por teste.

`meal_plan_items` também ganhou `slot_food_group`/`slot_food_subgroup`/`slot_nutritional_role` (aditivo, nullable) — carimbados a partir do slot de origem quando o template já foi migrado (item 8: "criar food slots/grupos" na refeição criada). Verificado em produção com um plano real (grupo EMAGRECIMENTO): cada item criado veio com a classificação correta (ex.: "Peito de frango grelhado" → PROTEIN/POULTRY).

## 9. IA (itens 9/10) — não alterados nesta fase

"Criar com IA" (`meal-plan-draft-agent.ts`) nunca referenciava templates — gera do zero via LLM + catálogo. Fora do escopo desta migração (a fase pede migrar os templates EXISTENTES, não integrar a IA a eles); "Criar por modelo" continua funcionando exatamente como antes na UX, só que agora também carimba proveniência e classificação de slot por baixo.

## 10. Templates clínicos (item 11)

`requires_professional_review=1` + `clinical_risk_level='high'` aplicado a GESTANTE, CRIANCA, TEA (têm template real) e BARIATRICO/RENAL/ONCOLOGICO (não têm — flag preparada pro dia em que forem cadastrados). IDOSO/RESISTENCIA_INSULINA/SOP marcados `medium`. Nenhum desses templates foi transformado em "protocolo universal" — o conteúdo/estrutura não mudou, só o metadado de risco.

## 11. Versionamento (item 13)

`protocol_templates.version` (novo, incrementado a cada re-classificação) + `structure_version` (`legacy` até migrar, `v2` depois). Os 12 templates migrados (11 canônicos + 1 personalizado) estão em `version=4, structure_version='v2'` (versão 4 por causa das 3 correções de classificador que exigiram reprocessar). Os 23 templates SUBSTITUICAO/SUPLEMENTACAO permanecem `structure_version='legacy'` — não têm refeições, então não há o que "slotificar" (documentado, não um gap).

## 12. Tabela de validação por template (item 15/18)

| Grupo | ID (preservado) | Versão | Migrado? | Refeições | Slots | Risco clínico | Revisão obrigatória |
|---|---|---|---|---|---|---|---|
| Adulto saudável | `tpl-adulto_saudavel-dieta-base` | 4 | ✅ | 3 | 9 | low | não |
| Adulto saudável (personalizado) | `98832006-...` | 4 | ✅ | 3 | 9 | low | não |
| Criança | `tpl-crianca-dieta-base` | 4 | ✅ | 3 | 9 | high | **sim** |
| Emagrecimento | `tpl-emagrecimento-dieta-base` | 4 | ✅ | 3 | 9 | low | não |
| Endurance | `tpl-endurance-dieta-base` | 4 | ✅ | 4 | 13 | low | não |
| Gestante | `tpl-gestante-dieta-base` | 4 | ✅ | 3 | 9 | high | **sim** |
| Ganho de massa | `tpl-hipertrofia-dieta-base` | 4 | ✅ | 3 | 9 | low | não |
| Idoso | `tpl-idoso-dieta-base` | 4 | ✅ | 3 | 9 | medium | não |
| Resistência à insulina | `tpl-resistencia_insulina-dieta-base` | 4 | ✅ | 3 | 9 | medium | não |
| SOP | `tpl-sop-dieta-base` | 4 | ✅ | 4 | 11 | medium | não |
| TEA | `tpl-tea-dieta-base` | 4 | ✅ | 3 | 9 | high | **sim** |
| Vegetariano estrito | `tpl-vegetariano_estrito-dieta-base` | 4 | ✅ | 3 | 9 | low | não |
| Bariátrico | *(nenhum)* | — | ❌ — **gap pré-existente, não fabricado** | — | — | high (flag preparada) | sim |
| Renal | *(nenhum)* | — | ❌ — **gap pré-existente, não fabricado** | — | — | high (flag preparada) | sim |
| Oncológico | *(nenhum)* | — | ❌ — **gap pré-existente, não fabricado** | — | — | high (flag preparada) | sim |

Legado desativado (não deletado): `tpl_sop_dieta_01/subs_01/supl_01`, `tpl_veg_dieta_01/subs_01/supl_01`, `tpl_endurance_dieta_01/subs_01/supl_01`, `tpl_res_insul_dieta_01/supl_01` — 11 linhas, `is_active=0`.

## 13. Testes (item 16)

- `tests/template-slots-migration.test.ts` (6 testes novos): proveniência carimbada quando há 1 template só; proveniência `null` quando ambíguo; slot propagado pro `meal_plan_item`; `NoTemplateForTargetGroupError` lançado pro gap real; `getTemplateStructure` monta refeições→slots→sugestões; retorna `null` pra template inexistente.
- `tests/food-exchange-groups.test.ts`: +3 testes de regressão (EGG vs POULTRY, aveia vs "ave", peito de galinha continua POULTRY).
- Mocks existentes de `@/lib/repositories/protocol-templates` em `tests/meal-plans-food-link.test.ts` atualizados (novo export `getSlotClassificationBySourceItemId`) — sem isso, 4 testes pré-existentes quebravam.
- Suite completa: **193 arquivos / 1713 testes, 100% passando.**

## 14. Gates finais

`tsc --noEmit` limpo · `eslint` limpo · `vitest run` 1713/1713 · `migrate:d1:check` 63/63 · `npm run build` sucesso · verificação manual em produção real (D1 + navegador): "Criar por modelo" pra EMAGRECIMENTO (201, proveniência + slots corretos), pra BARIATRICO (422, mensagem clara), plano de teste limpo depois.

## 15. Escopo deliberadamente não coberto

- UI pra editar slots diretamente (a UI de CRUD de templates continua editando só `diet_template_items`, formato antigo) — editar refeições de um template migrado pela UI atual apaga os slots dessa refeição (cascade), forçando re-rodar o backfill. Documentado, não corrigido — construir essa UI é um trabalho à parte.
- Integração de "Criar com IA" com a estrutura de slots dos templates.
- Templates BARIATRICO/RENAL/ONCOLOGICO continuam sem conteúdo — exige autoria clínica real, não uma migração automática.

## Declaração

**EXISTING_MEAL_TEMPLATES_MIGRATED: sim**

Todos os templates que existiam de fato (11 grupos canônicos + 1 personalizado, 12 no total) foram reestruturados pro modelo de refeição→grupo→subgrupo→nutritionalRole→slot, preservando 100% dos IDs, sem criar nenhuma biblioteca paralela, sem quebrar "Criar por modelo"/"Criar por IA" nem os 16 planos históricos (`template_id=NULL` confirmado em todos). Os 3 grupos sem template pré-existente (Bariátrico, Renal, Oncológico) foram deixados honestamente vazios — com sinalização clara em vez de plano fabricado — porque nunca houve um template real ali para migrar.
