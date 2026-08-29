# Meal Plan Substitution Engine R3 — Final QA / Release Closure

## Escopo entregue

Motor de equivalência por critério explícito (ENERGY/PROTEIN/CARBOHYDRATE/FAT)
conectado ao drawer real de trocas do Composer (`ExchangeGroupPanel`), com
cálculo em lote, medida caseira honesta (nunca inventada), ranking
determinístico reaproveitado, e toda a disciplina de preview sem escrita já
estabelecida na R2.3.

## Gates locais

| Gate | Resultado |
| --- | --- |
| Domínio puro (`equivalent-quantity.ts`) | 22/22 testes unitários PASS |
| API em lote (`equivalent-quantity/route.ts`) | 9/9 testes PASS |
| Consolidação de arredondamento (equivalence.ts/substitution-engine.ts) | Sem duplicação; testes pré-existentes desses módulos continuam PASS |
| TypeScript (`tsc --noEmit`) | PASS, 0 erros |
| ESLint (`eslint .`) | PASS, 0 erros/avisos |
| Build (`next build`) | PASS |
| Full Vitest | 1919/1919 PASS (226 arquivos) |
| E2E dedicado R3 (`meal-plan-substitution-r3-equivalent-quantity.spec.ts`) | 10/10 PASS em chromium-desktop, 10/10 PASS em mobile-chrome |
| E2E performance R3 | PASS, métricas registradas |
| Regressão ampla (`e2e/meal-plan*`, 81 testes) | 81/81 PASS |
| Regressão Patient Record (50 testes) | 50/50 PASS |
| Migrations novas | 0 |
| Escritas em produção | 0 (shim SQLite local do E2E) |

## Ajuste de teste pré-existente (documentado, não escondido)

`e2e/meal-plan-composer-r2-2-alternatives-drawer.spec.ts` tinha uma asserção
da R2 ("nunca a palavra 'equivalente' aparece no drawer") que foi
**deliberadamente superada** pela R3: o Substitution Engine introduz esse
vocabulário por design (quantidade equivalente por critério). A asserção foi
substituída por um comentário explicando a mudança de escopo — não removida
silenciosamente, e nenhuma outra parte do teste foi alterada.

## Cobertura por seção do pedido

- Criterion selector, batch, item/refeição/dia delta, apply/cancel, ranking,
  household portion, acessibilidade, mobile: cobertos por
  `e2e/meal-plan-substitution-r3-equivalent-quantity.spec.ts` (10 casos).
- OPTIONS/COMBINATION safety: 1 caso dedicado confirmando que o grupo de
  escolha nunca é alterado e o range do dia continua sendo renderizado.
- Large candidate set (20) / N+1: coberto no nível de API
  (`tests/equivalent-quantity-route.test.ts`), já que a busca real da UI
  limita a 8 resultados por vez (pré-existente da R2.2) — o endpoint em si
  aceita e resolve até 30 num único request, sem N+1.
- Performance: `e2e/meal-plan-substitution-r3-performance.spec.ts`, métricas
  registradas no relatório de performance.

## Escopo conscientemente fora desta fase

- Item-level exchange drawer para itens dentro de `options`/`choice_groups`
  (limitação pré-existente da R2.2, documentada no relatório de arquitetura,
  não uma lacuna introduzida ou fechada por esta fase).
- Templates, receitas, ranking clínico por IA, ajuste clínico automático,
  auto-publish — todos explicitamente fora do escopo pedido, não iniciados.
