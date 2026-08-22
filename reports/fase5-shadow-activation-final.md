# Fase 5 — Real Shadow Activation + Clinical Readiness Audit

Gerado em: 2026-08-22

Escopo respeitado: `prefer_canonical` **não** foi ativado em nenhum
ambiente; Nutrition Engine, cálculo, snapshots e IA de geração não foram
alterados. `CANONICAL_FOOD_RESOLVER_MODE=shadow` está setado **apenas**
em `.env.local` (ambiente local de testes) — a Vercel de produção não lê
esse arquivo, e a env var lá continua sem valor (`getCanonicalFoodResolverMode()`
trata isso como `"off"`).

## 1. Shadow ativado

`CANONICAL_FOOD_RESOLVER_MODE=shadow` configurado em `.env.local`.

Além disso — com aprovação explícita do usuário — `resolveFoodWithCanonicalShadow`/
`resolveFoodCandidatesWithCanonicalShadow` (`lib/nutrition/canonical-food-shadow.ts`)
agora são chamados pelos **3 pontos de produção reais** que antes chamavam
`resolveFoodCandidate(s)` direto:

- `app/api/admin/clients/[id]/meal-plans/substitutions/suggest/route.ts`
- `lib/ai/agents/nutrition/meal-plan-draft-agent.ts` (geração de rascunho de plano + operações add/replace item)
- `lib/ai/nutrition/substitution-command-router.ts`

Isso é seguro porque, com o flag em `"off"` (o valor real em produção),
o comportamento é **idêntico** a chamar `resolveFoodCandidate(s)` direto —
delega sem rodar nada do canônico. Em modo shadow, o valor devolvido ao
chamador continua **sempre** o do resolver atual.

Confirmado:
- resolver atual continua retornando o resultado (testado em
  `tests/canonical-food-shadow.test.ts`, `expect(result.ref?.sourceId).toBe("999")`
  mesmo quando o canônico discorda);
- canônico roda em paralelo (`Promise.all` em
  `lib/nutrition/canonical-food-shadow.ts`);
- nenhuma mudança de cálculo/plano/snapshot — nenhum arquivo de Nutrition
  Engine, cálculo de macro, ou persistência de plano foi tocado;
- nenhum fallback clínico novo — a checagem de segurança clínica
  (`checkFoodAgainstPatientRestrictions`) continua rodando exatamente
  como antes, dentro de `resolveFoodCandidate`, que o shadow só envolve.

## 2. Telemetria real

`CanonicalShadowTelemetryEvent` (`lib/nutrition/canonical-food-shadow.ts`)
tem todos os campos pedidos: `queryHash` (sha256, nunca texto livre),
`currentStatus`, `canonicalStatus`, `currentTopSource`, `canonicalTopSource`,
`canonicalScore`, `scoreGap` (novo nesta fase), `preparationConflict`
(novo nesta fase), `currentTimeMs`, `canonicalTimeMs`, `outcome`. Outcomes
implementados exatamente como pedido: SAME_TOP, DIFFERENT_TOP,
CANONICAL_FOUND_MORE, CANONICAL_FOUND_LESS, CANONICAL_AMBIGUOUS,
CANONICAL_PREPARATION_REVIEW, CANONICAL_NOT_FOUND.

Testado em `tests/canonical-food-shadow.test.ts` que o payload de
telemetria nunca contém o texto livre da query.

## 3. Latência (após todas as correções da Fase 4.5)

1.078 queries reais contra D1 real:

| | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|
| resolver atual | 369,5ms | 750,7ms | 971,9ms | 4.313ms |
| canônico | 353,2ms | 401,4ms | 511,4ms | 4.322ms |
| canônico — cold (n=1.062) | 353,5ms | 401,4ms | 511,4ms | 4.322ms |
| canônico — warm/cache (n=16) | 190,1ms | 201,1ms | 201,1ms | 201,1ms |

O canônico está consistentemente mais rápido que o atual na cauda (p95:
401ms vs 751ms) — o resolver atual continua fazendo múltiplos round-trips
HTTP não otimizados nesta fase (fora de escopo alterar
`food-resolver.ts`/`food-catalog.ts` além do fix de LIKE da Fase 4.5).
Cache quente (repetição do MESMO alimento decisivo) reduz p50 de 353ms
pra 190ms — amostra pequena (n=16, poucas repetições no dataset), mas na
direção esperada.

## 4. Dataset real de teste

**1.078 queries** (meta de 1.000+ cumprida): 130 do ground truth (Fases
3.5/4), ~130 queries naturais explícitas do pedido (arroz/feijão/ovo/
frango/banana/mamão/leite/milho/tilápia + variações de preparo/cultivar,
ver `scripts/canonical-nutrition-import/fase5-natural-queries.ts`), e 850
nomes reais aleatórios do catálogo TBCA+TACO+POF completo, deduplicados.

## 5. Auditoria DIFFERENT_TOP

23 casos. Classificação heurística (pré-filtro automatizado por
sobreposição de tokens entre query e nome — **não é julgamento humano
final**, é um auxílio pra priorizar revisão; dados brutos completos em
`reports/fase5-different-top-audit.json`):

| Categoria | Contagem |
|---|---:|
| BOTH_VALID | 22 |
| CANONICAL_BETTER | 1 |
| CURRENT_BETTER / TRUE_AMBIGUITY / BAD_CANONICAL_MATCH / BAD_CURRENT_MATCH | 0 |

**Nenhum caso "different" foi um erro real do canônico.** A esmagadora
maioria (22/23) é o mesmo alimento vindo de fontes diferentes com
formatação diferente — ex.: `"abacate"` → atual acha "Abacate, cru"
(TACO), canônico acha "Abacate" (IBGE_POF) — ambos corretos, só fontes
diferentes. Exemplo do único CANONICAL_BETTER: `"milho cozido"` → atual
achou "Cuscuz, de milho, cozido com sal" (match fraco, produto derivado
errado), canônico achou "Milho cozido" (IBGE_POF, match exato).

*Nota de metodologia:* a primeira versão da heurística tinha um bug (não
normalizava pontuação antes de comparar tokens, ex. "Abacate," ≠
"Abacate"), o que classificou 18/23 casos como falso `BAD_CURRENT_MATCH`.
Corrigido e re-executado sobre os mesmos dados brutos antes deste
relatório — reforça que essa classificação é heurística e precisa de
revisão humana antes de qualquer decisão automática.

## 6. Auditoria CANONICAL_FOUND_MORE

771 casos (71,5% do dataset — esperado: o catálogo canônico tem 10.063
alimentos vs. o catálogo do resolver atual, que é TACO+CUSTOM+fallback
USDA). Amostra de 60 em `reports/fase5-canonical-found-more-audit.json`:
100% TBCA, 25 via EXACT_NAME, 13 via PREFIX, 22 via CONTAINS. Inspeção
manual da amostra: em todos os 60 casos o nome canônico é **exatamente**
o texto da query ou a query + um sufixo legítimo da fonte ("Brasil",
"(média de vários tipos)", "(dado importado)") — nenhum caso de
hallucinação/match semanticamente errado observado. Cobre bem
preparações (`"Milho, pipoca, grão, cru"`), pratos compostos
(`"Canelone, c/ carne moída..."`, `"Acarajé, c/ sal [...]"`), e produtos
industrializados (`"Pão, c/ farinha de trigo refinada..."`).

Limitação honesta: boa parte da amostra vem do ground truth (que é
auto-referencial por construção — a query É uma redução do nome real),
então essa fatia não é validação 100% independente; a fatia vinda das
850 queries aleatórias e das naturais explícitas, porém, mostrou o mesmo
padrão de qualidade.

## 7. Confidence policy real

Critério atual (`canUseCanonical`): score≥90, gap≥8, sem conflito de
preparo. Sobre as 1.078 queries: **627 resoluções canônicas decisivas**
passariam nesse critério. Dessas, só **101** têm um resultado `RESOLVED`
do resolver atual pra comparar identidade (as outras 526 são casos onde o
atual não resolveu nada — sem "gabarito" pra medir precisão). Dessas 101:

**Precisão estimada: 77,2%** (78/101 identidade igual).

Nota importante: essa medida é **mais rigorosa** que o critério real de
promoção do `prefer_canonical` (que só promove quando `canonicalTop.source
=== "TACO"` — ver `resolveFoodWithCanonicalShadow`); aqui contei qualquer
fonte como "mesma identidade". 77,2% não é alto o suficiente pra
considerar a confidence policy pronta pra ativação sem mais trabalho —
fica registrado como risco explícito no go/no-go (item 13).

## 8. Source policy

Ver `reports/canonical-source-policy-analysis.md`. Resumo: nenhuma fonte
vence de forma consistente em identidade (TACO 26 / IBGE_POF 21 / TBCA 19
em 66 conflitos reais); IBGE_POF tem 100% de `preparation_code`
estruturado (TACO/TBCA têm 0%); só a TBCA tem medidas caseiras (100% das
8.157 porções); TBCA é a única fonte com cobertura real dos
micronutrientes "raros" (folato, B12, D, açúcar/sal adicionado). Nenhuma
prioridade absoluta criada — os dados confirmam que seria errado criar
uma.

## 9. Clinical readiness

Ver `reports/canonical-clinical-readiness.md`. Resumo: alimento/source/
provenance = **READY**; preparação/quantidade-porções/nutrientes clínicos
= **PARTIAL**.

## 10. Porções (8.157 medidas caseiras TBCA)

Ver `reports/canonical-portions-readiness.md`. 69,2% (5.644) têm grama
explícita e são seguras pro plano alimentar hoje; 30,8% (645 só-mL + 1.809
parsed-from-label + 59 unknown) precisam de revisão antes de entrar em
cálculo automático.

## 11. Nutrient readiness

Ver `reports/canonical-nutrient-readiness.md`. CORE bem coberto nas 3
fontes (55-99%). CLINICAL: TBCA cobre tudo (74-85%); TACO cobre minerais
principais (87-97%) mas zera em FOLATE/B12/VITAMIN_D/ADDED_SUGAR/
ADDED_SALT; IBGE_POF praticamente não tem minerais/vitaminas (0%).

## 12. Alias candidates

`reports/canonical-alias-candidates.md` — **4 candidatos**, todos
derivados de erros reais observados (`CANONICAL_FOUND_MORE` com query
curta/natural que o resolver atual não achou e o canônico achou via
PREFIX/CONTAINS com score ≥60). Nenhum inserido automaticamente. Número
baixo é esperado: a maioria das queries "naturais" já resolve bem via
EXACT_NAME ou FTS sem precisar de alias curado.

## 13. GO/NO-GO para prefer_canonical

| Critério | Resultado | Atende? |
|---|---|---|
| canonical_found_less = 0 | 0 (não aparece nos outcomes) | ✅ |
| LIKE/GLOB errors = 0 | 0/1.078 | ✅ |
| canonical runtime errors = 0 | 0/1.078 | ✅ |
| fallback = 100% | shadow sempre retorna o atual, sem exceção não tratada | ✅ |
| BAD_CANONICAL_MATCH muito baixo | 0 em 23 DIFFERENT_TOP auditados | ✅ |
| confidence policy com precisão alta | **77,2%** (101 amostras) | ❌ **não atinge "alta"** |
| latência aceitável | canônico mais rápido que o atual em p95/p99 | ✅ |
| zero mudança de cálculo clínico | Nutrition Engine intocado | ✅ |

**NO-GO para `prefer_canonical` ainda** — 7 de 8 critérios atendidos, mas
a precisão estimada da confidence policy (77,2%, amostra pequena de 101)
não é alta o suficiente pra ativação automática de identidade em
produção clínica. Próximos passos recomendados antes de reconsiderar:
aumentar a amostra de comparação (mais queries onde o atual TAMBÉM
resolve, pra medir precisão com mais confiança estatística), e investigar
os ~23% de discordância de identidade nos casos decisivos — nenhum
soou como corrupção de dado nesta amostra, mas "alta precisão" exige mais
que 101 pontos de referência antes de confiar automação clínica nisso.

## 14. Não fazer ainda — respeitado

Nenhuma destas ações foi executada: ativar `prefer_canonical`, alterar
Nutrition Engine, recalcular plano, alterar snapshots, remover resolver
atual, remover USDA, mudar a IA de geração (o agente de draft continua
gerando os mesmos itens — só a resolução de cada item, que já era
delegada, passou a rodar em shadow por baixo, sem mudar nenhuma saída).

## 15. Testes e gates

| Gate | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| `eslint .` | limpo |
| `vitest run` (suite completa) | **1636/1636 passaram** (187 arquivos) |
| `migrate:d1:check` | 56 migrações validadas |
| `npm run build` | exit 0 |

Testes novos: `tests/canonical-food-shadow.test.ts` (+3 testes: telemetria
com `scoreGap`/`preparationConflict`, dedup do wrapper em lote, modo
`off` sem overhead) — 8/8 passando no arquivo.

## 16. Riscos

- **Confidence policy com amostra pequena (n=101)** — precisão 77,2% pode
  não refletir o comportamento real em escala; não deve informar decisão
  de ativação sem mais dados.
- **IBGE_POF quase sem cobertura de minerais/vitaminas** — se o canônico
  algum dia priorizar IBGE_POF pra um alimento clinicamente relevante
  (ex.: sódio pra paciente hipertenso), o dado ficaria pior que o atual
  (TACO/USDA). Confirma que source policy não deve virar prioridade fixa
  sem considerar o nutriente específico em jogo.
- **30,8% das porções TBCA não são seguras pra cálculo automático** — só
  mL ou heurística de texto de baixa confiança.
- **Cache best-effort sem invalidação cross-processo** (já documentado na
  Fase 4.5) — continua válido.
- **Amostra de auditoria CANONICAL_FOUND_MORE parcialmente
  auto-referencial** (ground truth) — vale revalidar com uma amostra 100%
  independente antes de qualquer decisão final.

## 17. GO/NO-GO final

**CANONICAL_SHADOW_VALIDATION_READY: sim**

Shadow está funcionando no runtime real de teste (env var local + 3
pontos de produção reais integrados), sem alterar nenhuma resposta
clínica entregue ao usuário (confirmado por teste automatizado e por
`prefer_canonical` continuar fora de qualquer ambiente). Isso habilita a
próxima fase a coletar telemetria de tráfego real local — **não** implica
`prefer_canonical`, que continua **NO-GO** (item 13) até a precisão da
confidence policy ser medida com uma amostra maior.
