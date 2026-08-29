# Meal Plan Composer R2 — performance audit (final)

Baseline local, servidor E2E isolado (shim SQLite local, porta própria, nunca a porta 3000 do worktree principal), BUILD_ID `bjD6YIzlqqh86Xwg27tXA`. Não é um SLA — captura o que existe hoje.

## Live Nutrition

| Métrica | Amostras | Valor |
| --- | --- | --- |
| Render inicial de um plano grande (7 refeições, ~37 itens, SIMPLE+OPTIONS+COMBINATION) até a Live Nutrition aparecer | 2 | 1061 ms / 1437 ms |
| Alterar quantidade de um item → Live Nutrition atualiza | 2 | 39 ms / 47 ms (p50≈43, p95≈47) |
| Selecionar candidato no drawer de Trocas → item delta + impacto refeição/dia renderizados | 3 amostras/execução | p50 465–456 ms, p95 634–496 ms (duas execuções) |

"Adicionar alimento" em si é síncrono (linha em branco, sem rede); o tempo relevante é o mesmo pipeline de hidratação+recálculo medido acima para quantidade (a seleção de um alimento já resolvido dispara o mesmo caminho) — não isolado como uma métrica própria nesta fase.

## N+1 (achado real e corrigido nesta fase de fechamento)

Auditoria de rede no plano grande encontrou um N+1 real e pré-existente: `MealItemsEditor.tsx` tinha um efeito de "priming" de sugestões que disparava `GET /api/admin/foods/search` **para cada item** (até 24 requisições simultâneas para um plano de 37 itens), mesmo para itens que já tinham identidade estruturada (`food_source`+`food_ref_id`) e não precisavam de sugestão nenhuma. Corrigido: o priming agora só roda para itens em texto livre sem identidade.

| Endpoint | Antes | Depois (plano de 37 itens) |
| --- | --- | --- |
| `/api/admin/foods/search` (priming) | 24 requisições | 0 |
| `/api/admin/foods/resolve` (lote estruturado) | 2 | 2 |

`/api/admin/foods/resolve` já era em lote (uma requisição por instância do hook que consome a hidratação, nunca por item) — confirmado que continua assim mesmo em 37 itens.

## Hidratação em lote (reuso confirmado)

`useMealPlanNutritionData` (sidebar real e preview do drawer de trocas, R2.3) usa exatamente esse mesmo lote — cada instância do hook hidrata uma vez, nunca por nutriente/item. O preview do drawer paga o custo de rodar essa hidratação uma segunda vez (documentado em `reports/meal-plan-composer-r2-3-nutrition-preview.md`), aceito como troca simples nesta fase.
