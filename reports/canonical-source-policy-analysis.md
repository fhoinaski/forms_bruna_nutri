# Source Policy Analysis — Fase 5 (item 8)

Gerado em: 2026-08-22. Dados reais: D1 (`canonical_foods`,
`canonical_food_portions`, `food_nutrient_values`) + amostra de 66 queries
do shadow dataset onde 2+ fontes diferentes competiram pelo mesmo termo
(`reports/fase5-source-conflicts.json`).

## Qual fonte costuma ter melhor identidade (ganha o score mais alto)?

Nenhuma fonte domina. Na amostra de 66 conflitos reais, a fonte com maior
score venceu em proporções próximas: **TACO 26, IBGE_POF 21, TBCA 19**.
Confirma a decisão de arquitetura já em vigor desde a Fase 3
(`sourceTiebreak`, máx. 2 pontos, só desempata em empate real) — **não
existe justificativa nos dados pra criar uma hierarquia fixa de fonte**;
qual fonte "ganha" depende do nome exato da query, não da fonte em si.

## Qual tem melhor preparação (estruturada)?

**IBGE_POF: 100% dos 1.944 alimentos têm `preparation_code` preenchido.**
TACO e TBCA têm **0%** — nessas duas fontes, o preparo está só embutido no
texto do nome (ex.: "Milho, verde, cozido"), nunca numa coluna estruturada
própria. Achado real, contrário à suposição inicial (esperava-se TBCA na
frente por ter colunas `preparation_method`/`preparation_name` no schema —
essas colunas existem mas ficaram vazias na importação real da TBCA;
TACO/TBCA dependem do parser de preparo no texto do nome em tempo de
busca, não de um campo pré-computado).

## Qual tem medidas caseiras (porções)?

**Só a TBCA.** 100% das 8.157 linhas de `canonical_food_portions` são
TBCA — TACO e IBGE_POF não têm nenhuma medida caseira estruturada no
catálogo canônico atual (fora de escopo das fases anteriores de
importação, que só extraíram porções da TBCA).

## Qual tem melhor cobertura nutricional?

Ver `reports/canonical-nutrient-readiness.md` para a matriz completa.
Resumo: TBCA é a única com cobertura real nos micronutrientes "raros"
(FOLATE, VITAMIN_B12, VITAMIN_D, ADDED_SUGAR, ADDED_SALT); TACO é forte em
minerais principais (Ca/Fe/Mg/K/Zn todos >90%) mas zera nos "raros";
IBGE_POF é a mais fraca em nutrientes (quase zero em minerais e vitaminas
raras), mas forte em CORE (energia/macros).

## Conclusão — sem prioridade absoluta

Os dados confirmam a decisão já tomada nas fases anteriores: **nenhuma
fonte deve virar prioridade fixa**. Cada uma é melhor em uma dimensão
diferente:

| Dimensão | Melhor fonte |
|---|---|
| Identidade (nome bate melhor) | Nenhuma — varia por query |
| Preparação estruturada | IBGE_POF |
| Medidas caseiras | TBCA (exclusivo) |
| Cobertura nutricional CORE | Todas boas, TACO levemente à frente |
| Cobertura nutricional CLINICAL rara | TBCA (exclusivo) |

Um alimento resolvido via TACO pode ter identidade perfeita mas nenhuma
medida caseira; um resolvido via TBCA tem porções mas pode não ter
`preparation_code` estruturado; um resolvido via IBGE_POF tem preparo
estruturado mas quase nenhum micronutriente. Isso reforça que **misturar
dado de fontes diferentes pro MESMO alimento seria arriscado** (o motivo
pelo qual o projeto nunca faz cross-source merge) — mas escolher a
melhor fonte PARA CADA QUERY, como o ranking já faz, é o caminho certo.
