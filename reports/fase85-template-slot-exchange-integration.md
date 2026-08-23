# Fase 8.5 — Template Slot → Food Exchange Group Integration

## 1. Auditoria

Antes de qualquer código, mapeei o caminho real slot→item hoje:

- `diet_template_slots`/`diet_template_slot_foods` (Fase 8) já guardavam `food_group`/`food_subgroup`/`nutritional_role`/`exchange_eligible` por posição de refeição do template, mas isso **morria em metadado**: `createMealPlanFromTemplates` só copiava `food_group`/`food_subgroup`/`nutritional_role` pro `meal_plan_item` criado (Fase 8) — nunca o **id do slot de origem** nem a **elegibilidade de troca**. O `MealItemsEditor` não exibia nada disso, a busca de alimento não sabia que existia um slot, e o botão "Grupo de troca" aparecia igual pra qualquer item.
- `getSlotClassificationBySourceItemId` (repositório) já existia, mas devolvia só 3 campos — faltavam `slot_id` e `exchange_eligible`.
- O Food Exchange Engine (Fase 7) e o Substitution Engine já classificam o alimento *escolhido* sozinhos (via `classifyFoodExchangeGroup`), então **nunca precisaram** do slot pra funcionar — o gap real era o slot não conseguir **restringir/avisar** a escolha ANTES da geração de grupo de troca, e a IA não ter nenhum freio contra propor um alimento fora do grupo.

## 2. Slot como contrato funcional (item 2)

`meal_plan_items` ganhou duas colunas novas (aditivas): `template_slot_id`, `slot_exchange_eligible` — somadas às três já existentes da Fase 8 (`slot_food_group`/`slot_food_subgroup`/`slot_nutritional_role`), o item agora carrega os 5 campos do contrato pedido. `createMealPlanFromTemplates` carimba todos os 5 a partir do slot de origem real (nunca inventado).

## 3/4. Slot ≠ alimento — verificado ao vivo, não só no código

`selectSuggestion()` (MealItemsEditor) só atualiza `food`/`food_source`/`food_ref_id`/`canonical_food_id` — nunca toca em `slot_*`/`template_slot_id`. Testei isso de ponta a ponta num plano real: criei "Emagrecimento" por modelo, troquei deliberadamente o item do slot `PROTEÍNA` do Almoço por **"Arroz, tipo 1, cozido"** (incompatível de propósito), salvei, e o PUT persistido confirma:

```json
{ "food": "Arroz, tipo 1, cozido", "food_source": "TACO", "food_ref_id": "3",
  "slot_food_group": "PROTEIN", "slot_food_subgroup": "POULTRY",
  "template_slot_id": "f397fa7a-6523-4212-8fea-5ad3a9e98803", "slot_exchange_eligible": true }
```

O slot (posição, grupo esperado) e o alimento (o que foi escolhido) continuam informações **completamente independentes**, mesmo incompatíveis entre si, mesmo depois de um ciclo salvar→reler.

## 5/6. MealPlanEditor — badge do slot + busca contextual

- Badge visual (`PROTEÍNA`, `CARBOIDRATO`, `VEGETAL`, `FRUTA`, `LATICÍNIO`, `GORDURA`) acima do campo de busca, quando o item tem slot. Verificado ao vivo — todos os 10 itens de um plano recém-criado ("Adulto saudável"/"Emagrecimento") mostraram o rótulo certo.
- Placeholder dinâmico: `"Buscar proteína..."`, `"Buscar carboidrato..."` em vez do genérico `"Buscar alimento..."`.
- Sugestões de busca são **reordenadas** (nunca filtradas/excluídas) pra priorizar alimentos do mesmo `foodGroup` do slot — classificado no cliente com o MESMO `classifyFoodExchangeGroup` da Fase 7, usando o `grupo`/macros que a própria resposta de busca já traz. Um slot `PROTEIN` nunca deixa arroz/batata aparecer primeiro na lista.

## 7. Sugestão automática — não implementado como feature separada

O pedido pede "sugerir alimentos compatíveis, mas não assumir automaticamente". A reordenação contextual da busca (item 6) já cobre isso na prática: a nutricionista digita/abre a busca e os compatíveis aparecem primeiro — mas **nada é pré-selecionado sozinho**. Não construí uma segunda superfície de "sugestões" separada da busca, pra não duplicar UI com o mesmo propósito.

## 8. Slot + primaryFood → Exchange Group

Sem mudança de engine: o Food Exchange Engine (Fase 7) já classifica o `primaryFood` (o alimento realmente escolhido, nunca o slot) e busca candidatos do mesmo grupo/subgrupo — isso já era exatamente "slot + primaryFood formam um grupo de troca" na prática, porque o primaryFood JÁ carrega sua própria classificação real quando o grupo é gerado. Verificado que continua funcionando sem regressão (testes Fase 7 + suite completa).

## 9. Elegibilidade (exchangeEligible)

- Coluna `slot_exchange_eligible` carimbada no item (item 2).
- Botão "Grupo de troca" no editor agora só aparece quando `item.slot_exchange_eligible !== false` (`undefined`/`null`/`true` continuam mostrando — só `false` explícito esconde). Coberto por teste (`cleanMealsForSave` preserva `false` como `false`, nunca vira `null`/`true`).
- Nenhum template real hoje tem um slot marcado `exchange_eligible=false` (os 118 alimentos migrados são todos comida de verdade, sem água/tempero) — então não pude testar a ocultação do botão *ao vivo* contra um item real; a condição em si é uma linha revisável diretamente e está coberta por teste unitário.

## 10. IA — respeita o grupo do slot (não pode ignorar)

`meal_plan_change_agent.ts` (operação `add_substitution`, usada tanto pelo Assistente de IA quanto por qualquer fluxo que proponha substituição) agora **valida deterministicamente** — nunca confia no modelo — que o candidato proposto pertence ao mesmo `foodGroup` do slot do item, ANTES de calcular a equivalência. Se não pertencer, rejeita com `MealPlanChangeValidationError` explicando o motivo. Testado: candidato de grupo errado é rejeitado; candidato do mesmo grupo passa; item sem slot continua sem essa restrição (comportamento idêntico ao de antes).

Não construí um wizard novo de "IA preenche slots vazios" (item 12) — "Criar com IA" continua gerando do zero, sem tocar templates, exatamente como documentado como fora de escopo na Fase 8. O que ESTE item pedia de concreto e testável — "não permitir a IA ignorar o grupo" — está implementado e é o freio que qualquer fluxo de IA futuro (incluindo um wizard de preenchimento de slot) teria que passar.

## 11/12. Criação por modelo / Criar com IA

- "Criar por modelo" já carregava refeições+grupos+papéis desde a Fase 8; agora também carrega `template_slot_id` e `slot_exchange_eligible`. Verificado ao vivo (seção 3/4).
- "Criar com IA" continua sem tocar templates (decisão da Fase 8, reafirmada aqui) — não criei um sistema paralelo de slots pra IA.

## 13. Slot vazio

`item.food` pode ser `""` com slot preenchido sem erro — a UI já suporta isso estruturalmente (é só uma string vazia), e o placeholder guia a nutricionista ("Buscar proteína..."). Não construí uma tabela de "slot fantasma" independente de `meal_plan_items` (persistir uma posição sem NENHUM item) — isso exigiria um modelo de dados novo e maior; documentado como limitação, não como bug.

## 14. Incompatibilidade — avisa, nunca bloqueia

Banner inline: *"Este alimento não corresponde ao grupo esperado deste slot (Proteína)."* com **"Manter mesmo assim"** (dispensa o aviso pra aquele alimento específico) e **"Escolher outro"** (reabre a busca). Testado ao vivo: digitar "arroz" num slot `PROTEÍNA` mostra o aviso em tempo real (antes mesmo de confirmar a seleção); selecionar mantém o aviso; "Manter mesmo assim" o remove; o item continua 100% editável.

## 15. Substituições — ordem já implementada na Fase 7, reafirmada aqui

`generateExchangeGroupAlternatives` já segue exatamente a ordem pedida (mesmo subgrupo → mesmo grupo → papel compatível → quantidade equivalente → score) desde a Fase 7 — nenhuma mudança de engine necessária, só a IA (item 10) ganhou o freio de grupo adicional nesta fase.

## 16. UX

Mantive compacto de propósito: badge de uma linha + placeholder contextual, sem cards novos por item. O aviso de incompatibilidade só aparece quando existe incompatibilidade real (nunca ocupa espaço à toa).

## 17. Templates existentes — validados

Query real em produção: os 12 templates migrados (11 canônicos + 1 personalizado) têm **0 slots com `food_group`/`food_subgroup`/`nutritional_role` nulos e 0 com `exchange_eligible` nulo** — toda refeição, todo slot, carrega classificação completa.

## 18. Bariátrico/Renal/Oncológico

Inalterados. Nenhum código desta fase toca a checagem de `NoTemplateForTargetGroupError` da Fase 8 — continuam retornando 422, nada foi inventado.

## 19. Planos históricos

Inalterados — as duas colunas novas (`template_slot_id`, `slot_exchange_eligible`) são aditivas e nullable; nenhum plano existente foi tocado (mesmo padrão de todas as fases anteriores, verificado por não haver nenhum UPDATE de linha existente nas migrações desta fase).

## 20. Testes

- `tests/meal-items-editor-helpers.test.ts`: `cleanMealsForSave` preserva os 5 campos de slot através do ciclo salvar (com slot, sem slot, `exchange_eligible=false` explícito nunca vira `null`/`true`).
- `tests/template-slots-migration.test.ts`: `template_slot_id`/`slot_exchange_eligible` chegam corretos no `INSERT INTO meal_plan_items` (`true`→1, `false`→0).
- `tests/meal-plan-change-substitutions.test.ts`: IA rejeita candidato de grupo diferente do slot; aceita candidato do mesmo grupo; item sem slot continua sem restrição.
- Suite completa: **193 arquivos / 1721 testes, 100% passando.**
- Não escrevi teste de render/interação pra `isSuggestionCompatibleWithSlot`/`isItemCompatibleWithSlot` (funções internas do componente, não exportadas) — a lógica de classificação que elas usam já tem cobertura extensa em `tests/food-exchange-groups.test.ts`; a integração foi verificada manualmente no navegador (seções 3/4/6/14) em vez de um teste de componente automatizado, por escopo/tempo.

## 21. E2E manual (não automatizado em Playwright nesta fase)

Rodei o fluxo completo manualmente contra o app real (D1 de produção + navegador):
1. Selecionar "Emagrecimento" → Criar por modelo → 201, `template_id`/`template_version` carimbados.
2. Abrir o plano → badges de slot corretos em todos os 10 itens.
3. Selecionar "Arroz, tipo 1, cozido" num slot PROTEÍNA → aviso aparece.
4. "Manter mesmo assim" → aviso some, item preservado.
5. Salvar → PUT 200.
6. Reler o plano salvo (via a própria resposta do PUT, que devolve o plano hidratado) → `template_slot_id`/`slot_food_group`/`slot_exchange_eligible` todos preservados no item, incluindo o item deliberadamente incompatível.
7. Plano de teste excluído ao final (ambiente limpo).

Não escrevi isso como spec Playwright automatizada (`e2e/*.spec.ts`) — ficou como verificação manual documentada. Sinalizado como próximo passo, não fingido como feito.

## 22. Gates

`tsc --noEmit` limpo · `eslint` limpo · `vitest run` 1721/1721 (193 arquivos) · `migrate:d1:check` 64/64 · `npm run build` sucesso · verificação manual completa em produção real (seção 21).

## 23. Não fiz (conforme pedido)

Não inventei templates pros 3 grupos sem conteúdo. Não alterei nenhum plano histórico. IA nunca aprova (só propõe, e agora nem propõe fora do grupo). Nunca uso kcal como único critério (a ordem do item 15 já vem da Fase 7, subgrupo antes de tudo). Nunca misturo nutrientes entre fontes (Nutrition Engine intocado). Nunca criei uma segunda tabela/sistema de slots paralelo — tudo aditivo sobre `diet_template_slots`/`meal_plan_items` já existentes.

## Riscos conhecidos, documentados

- Editar as refeições de um template migrado pela UI de CRUD antiga (`/dashboard/templates`) ainda apaga os slots dessa refeição (cascade) — risco já documentado na Fase 8, não resolvido aqui (fora de escopo, exigiria reconstruir aquela UI).
- Slot vazio (posição sem nenhum alimento) não persiste como entidade própria — só existe enquanto o item em memória tem `food=""`; recarregar a página antes de salvar perde a posição vazia (mas não perde nada que já foi salvo).

## Declaração

**TEMPLATE_EXCHANGE_GROUP_INTEGRATION_READY: sim**

Os slots dos templates passaram a orientar de fato a escolha e a substituição de alimentos dentro do MealPlanEditor: aparecem como contexto visual (badge + placeholder), influenciam a ordem da busca, geram aviso (não bloqueio) quando o alimento escolhido não bate com o grupo esperado, restringem deterministicamente o que a IA pode propor como substituição, e sobrevivem intactos — comprovado com um plano real salvo e relido — a um ciclo completo de criação por modelo, edição manual e salvamento.
