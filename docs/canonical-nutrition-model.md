# Canonical Nutrition Model — TBCA 7.3 + TACO + IBGE/POF 2008–2009

Data: 2026-08-21
Status: **desenho, nenhuma migration criada, nenhuma importação feita, Nutrition Engine não tocado.**

Fontes analisadas nesta etapa:

- `taco.json` (lido: cabeçalho, `nutrient_definitions`, primeiro `food`) — 597 alimentos, formato já convertido para o `nutritional_schema.json` comum.
- `ibge_pof_2008_2009.json` (lido: cabeçalho, `nutrient_definitions`, primeiro `food`) — 1.944 registros, mesmo formato comum, com `preparation.code`/`preparation.name` por linha.
- `tbca-audit-summary.md` + `tbca-audit-report.json` (lidos: inventário por collection, exemplos de inconsistência, sem carregar `tbca_completa.json`, 610 MB) — 19.271 registros processados via streaming pelo script de auditoria.
- `nutritional_schema.json`, `tbca.json` (manifesto de licença), `collection_manifest.json`, `bases_internacionais_catalogo.json` — contexto de licenciamento e formato comum já adotado pelo pacote de conversão.
- Estado atual do projeto: `db/20260811_0034_nutrition_engine_core.sql`, `..._0046_food_portion_snapshots_and_manufacturer.sql`, `..._0047_usda_selected_catalog_schema.sql`, `..._0049_usda_search_index.sql`, `..._0050_import_batches.sql`, `lib/nutrition/nutrient-vocabulary.ts`, `lib/nutrition/food-catalog.ts`, `lib/nutrition/food-resolver.ts`, `lib/nutrition/portion-resolution.ts`, e `docs/FOOD-KNOWLEDGE-BASE-ARCHITECTURE.md` (decisão anterior, ainda válida, sobre catálogo core em D1 + fontes externas fora do bundle).

Este documento **não substitui** `FOOD-KNOWLEDGE-BASE-ARCHITECTURE.md`; ele especializa a seção "Modelo de dados recomendado" daquele documento para as três fontes que já temos convertidas e auditadas (TBCA, TACO, POF), definindo o modelo canônico concreto antes de qualquer `CREATE TABLE`.

---

## 0. O que a auditoria da TBCA já comprovou (não repetir)

- `MAIN_COLLECTION = composicao_alimentos_medidas_caseiras` (5.875 registros, 41 nutrientes/alimento em média, 82 no máximo, 1,388 medidas caseiras/alimento).
- `composicao_alimentos_medidas_caseiras_personalizadas` é **duplicata exata** de `medidas_caseiras` (5.875/5.875 `EXACT_DUPLICATE`) → **não importar**, tratar como alias descartável.
- `composicao_informacao_estatistica` (5.874 registros) é o **mesmo alimento** da principal, mas com `SAME_FOOD_DIFFERENT_NUTRIENTS` — é a fonte de estatística (mean/sd/min/max/n), não uma segunda opinião nutricional.
- `composicao_informacao_estatistica_produtos` (307) e `biodiversidade_e_alimentos_regionais` (1.340) não têm `source_food_id` em comum com a principal — são catálogos **complementares e disjuntos**, não substitutos.
- Qualidade conhecida a preservar, nunca "corrigir" silenciosamente:
  - `trace_as_zero`: 15.774 ocorrências em `medidas_caseiras` — nutriente com status `trace` não pode virar `0`.
  - `label_has_weight_but_no_quantity`: 75.891 — o rótulo da medida caseira menciona peso (ex.: "Pedaço/Unidade/Fatia (M) (370 g)") mas o campo `quantity` estruturado não bate ou está ausente.
  - `portion_value_mismatch`: 606 — o valor do nutriente na medida caseira diverge (fora de tolerância 5%) do valor esperado por escalonamento linear do valor per-100g.
  - `portion_ml_not_validated`: 26.429 — medidas em mL sem confirmação de densidade; **nunca assumir mL = g**.
  - `biodiversidade_e_alimentos_regionais` tem `nutrient_unknown_unit: {'Kcal': 95}` — unidade não reconhecida pelo normalizador atual, precisa de mapeamento explícito antes de importar essa collection.

---

## 1. Formato de origem comum (já convertido) vs. modelo canônico do projeto

TACO e POF já chegam no formato de `nutritional_schema.json` (mesmo `$id`): `source`, `nutrient_definitions[]`, `foods[]` com `nutrients[]` tipados (`nutrient_id`, `value`, `status`, `raw`). TBCA (via `tbca_completa.json`, não lido diretamente) segue o mesmo formato, confirmado pelos `nutrient_id` como `"tbca:sodio:mg"` nos exemplos do audit report e pelo `suggested_record_shape` em `tbca.json`.

Isso significa que **as três fontes já compartilham um formato de interoperabilidade**, mas esse formato ainda não é o modelo canônico do projeto — ele é o formato de *importação*. O modelo canônico abaixo é o que o Nutrition Engine efetivamente consome, e é deliberadamente mais estreito: authoritative source-per-value, vocabulário de nutrientes fixo do projeto (`lib/nutrition/nutrient-vocabulary.ts`), e sem os campos livres (`raw`, `metadata` arbitrário) que servem só à auditoria.

```text
tbca_completa.json ─┐
taco.json ───────────┼─→ [importador por fonte] → CanonicalFood/FoodNutrientValue/FoodPortion (D1)
ibge_pof_2008_2009.json ─┘                              │
                                                          ▼
                                          Nutrition Engine (não conhece TBCA/TACO/POF)
```

---

## 2. Entidades canônicas

### 2.1 `CanonicalFood`

Um alimento **por fonte** (não é deduplicado entre fontes — ver seção 10). Equivale ao `food` do schema comum, estreitado.

```ts
interface CanonicalFood {
  id: string;              // ID canônico estável do projeto — ver seção "IDs canônicos"
  source: FoodSource;       // "TBCA" | "TACO" | "IBGE_POF" | "CUSTOM" | "MANUFACTURER" | "USDA_FOUNDATION" | "USDA_SR_LEGACY" | "OPEN_FOOD_FACTS"
  sourceVersion: string;    // "7.3" | "4ª edição revisada e ampliada (2011)" | "2008–2009"
  sourceFoodId: string;     // chave natural na fonte: TBCA "BRC0001C", TACO "1", POF "6300101:99"
  sourceCollection?: string | null; // TBCA apenas: "composicao_alimentos_medidas_caseiras" | "biodiversidade_e_alimentos_regionais" | "composicao_informacao_estatistica_produtos"
  name: string;             // nome técnico original — nunca reescrito (identidade nutricional)
  scientificName?: string | null;
  basis: FoodBasis;         // ver seção 13
  classification?: FoodClassification | null;
  preparation?: FoodPreparation | null;
  sourceDetailUrl?: string | null; // TBCA fornece URL de detalhe por registro
  dataOrigin?: "analytical" | "calculated" | "attributed" | null; // TBCA: origem do dado (analítico/calculado/atribuído)
  createdAt: string;
  importBatchId: string;    // FK para import_batches (rastreabilidade — já existe no projeto)
}
```

### 2.2 `CanonicalNutrient`

Vocabulário fixo do projeto. **Reaproveita `lib/nutrition/nutrient-vocabulary.ts` como fonte da verdade**, em vez de criar um segundo vocabulário canônico paralelo — é exatamente o `NutrientCode` que já existe.

```ts
interface CanonicalNutrient {
  code: NutrientCode;   // já existe: "ENERGY_KCAL" | "PROTEIN" | ... (34 códigos hoje)
  label: string;        // já existe
  unit: NutrientUnit;   // já existe: "g" | "mg" | "mcg" | "kcal" | "kJ"
}
```

TBCA tem até 82 nutrientes/alimento (41 distintos observados na amostra do audit, mas o schema completo da TBCA cobre bem mais — carboidratos por perfil, flavonoides, etc., fora do escopo do vocabulário atual). **Decisão:** nutrientes da fonte sem `NutrientCode` correspondente **não são descartados silenciosamente** — entram como `status: "unmapped"` em `FoodNutrientValue` com o `sourceNutrientId` original preservado, disponíveis para consulta/auditoria, mas invisíveis ao Nutrition Engine até que alguém adicione o código correspondente ao vocabulário. Isso evita duas coisas ruins: (a) perder dado silenciosamente, (b) inflar o vocabulário canônico com nutrientes que a engine não sabe usar ainda.

### 2.3 `FoodNutrientValue`

O núcleo do modelo — substitui a ideia de "uma linha larga por alimento" (como `custom_foods` hoje) por long-format, que é o único jeito de acomodar TBCA (82 nutrientes) sem uma tabela de centenas de colunas.

```ts
interface FoodNutrientValue {
  id: string;
  foodId: string;              // FK CanonicalFood.id
  nutrientCode: NutrientCode | null; // null quando unmapped (ver 2.2)
  sourceNutrientId: string;    // "tbca:sodio:mg" | "taco:proteina" | "ibge_pof_2008_2009:protein_g" — sempre preservado
  value: number | null;
  unit: NutrientUnit | string; // string livre quando unmapped/unidade não reconhecida (ex.: "Kcal" da biodiversidade)
  status: NutrientValueStatus; // ver seção 14
  basis: FoodBasis;            // herdado do food, mas registrado aqui pois medida caseira pode ter basis distinta
  portionId?: string | null;   // presente quando o valor é específico de uma medida caseira, não do per-100g base
  standardDeviation?: number | null;
  standardError?: number | null;
  numberOfObservations?: number | null;
  minimum?: number | null;
  maximum?: number | null;
  raw: string | null;          // valor bruto da fonte, sempre preservado (ex.: "70.13866666666667", "Tr", "135,62")
  source: FoodSource;
  sourceFoodId: string;        // denormalizado para query/auditoria sem join
}
```

`standardDeviation`/`minimum`/`maximum`/`numberOfObservations` vêm de `composicao_informacao_estatistica` (ver seção 23) e ficam `null` para TACO/POF, que não publicam essas estatísticas.

### 2.4 `FoodPortion`

Medida caseira (nome, quantidade, unidade, peso em g quando conhecido). É uma extensão da tabela `food_portions` que já existe no projeto (`db/...0046...sql`), não uma tabela nova do zero.

```ts
interface FoodPortion {
  id: string;
  foodId: string;         // FK CanonicalFood.id (novo — hoje food_portions usa food_source+food_ref_id, ver seção 11)
  label: string;          // "Pedaço/Unidade/Fatia (M) (370 g)" — texto original, nunca reescrito
  quantity: number | null;
  unit: string | null;    // "g" | "ml" | "unidade" | null quando não parseável
  gramWeight: number | null;  // só preenchido quando confiável — ver seção 18 (mL sem densidade)
  mlWeight: number | null;
  weightSource: "structured_quantity" | "parsed_from_label" | "unknown";
  confidence: "high" | "medium" | "low";
  source: FoodSource;
  sourceFoodId: string;
}
```

### 2.5 `FoodSource`

Não é uma tabela — é o enum de proveniência, já anunciado em `FOOD-KNOWLEDGE-BASE-ARCHITECTURE.md`, estendido aqui com `IBGE_POF`:

```ts
type FoodSource =
  | "TBCA"
  | "TACO"
  | "IBGE_POF"
  | "CUSTOM"
  | "MANUFACTURER"
  | "USDA_FOUNDATION"
  | "USDA_SR_LEGACY"
  | "OPEN_FOOD_FACTS";
```

Metadados por fonte (versão, licença, URL, regra de prioridade) ficam numa tabela `food_sources` pequena e estática — não uma entidade rica, apenas o registro de proveniência (ver seção "schema D1").

### 2.6 `FoodClassification`

```ts
interface FoodClassification {
  groupCode: string | null;   // TBCA: "B" de "B - Vegetais e derivados"
  groupName: string | null;   // TACO/POF não têm grupo estruturado hoje — fica null, nunca inventado
  foodType: string | null;    // TBCA: "D - Preparação" | "A - Alimento in natura" | "F - Preparo simples..." | "B - ...processado (ingrediente)" | "C - ...processado pronto para consumo"
}
```

### 2.7 `FoodPreparation`

```ts
interface FoodPreparation {
  method: string | null;      // TBCA: "cru" | "cozido" | "assado" | "grelhado" | "frito" | "refogado" | etc, extraído do nome/metadata
  code?: string | number | null; // POF: preparation.code (ex.: 99 = "Não se aplica")
  name?: string | null;       // POF: preparation.name original
}
```

POF já traz `preparation.code`/`preparation.name` estruturado por linha (confirmado no registro lido: `"preparation": {"code": 99, "name": "Não se aplica"}`). TBCA não tem campo de preparo estruturado no formato comum — precisa ser inferido do nome (`extractPreparation` já existe em `lib/nutrition/food-preparation.ts`, reaproveitar em vez de recriar).

### 2.8 `NutrientStatistics`

Não é uma tabela separada — é um conjunto de colunas opcionais em `FoodNutrientValue` (seção 2.3: `standardDeviation`, `standardError`, `minimum`, `maximum`, `numberOfObservations`), populado apenas quando a fonte for `composicao_informacao_estatistica` da TBCA. Modelar como tabela à parte obrigaria um join em toda leitura de nutriente só para os ~5.874 alimentos da TBCA que têm estatística — custo desnecessário para um dado que é opcional e 1:1 com a linha principal.

### 2.9 Aliases de alimentos

```ts
interface FoodAlias {
  id: string;
  foodId: string;       // FK CanonicalFood.id
  alias: string;         // variação de nome/grafia
  aliasType: "spelling" | "regional" | "abbreviation" | "search_synonym";
  source: "curated" | "derived_from_normalization";
}
```

Nesta etapa **não populamos aliases automaticamente entre fontes** (isso seria matching, seção 11) — só aliases *dentro* de uma fonte, quando o nome normalizado colide (TBCA: 5.875 registros → 5.801 nomes normalizados únicos, ou seja, ~74 colisões a resolver como aliases, não como duplicatas a descartar).

---

## 3. Source priority

Reaproveita a política já definida em `FOOD-KNOWLEDGE-BASE-ARCHITECTURE.md`, com `IBGE_POF` inserido entre TACO e TBCA (fonte oficial brasileira, mas cobertura de nutrientes menor que TBCA — 20 nutrientes vs. até 82):

1. `CUSTOM` (nutricionista)
2. `MANUFACTURER`
3. `TACO` (referência brasileira mais usada clinicamente, cobertura completa nos macros)
4. `IBGE_POF` (oficial, mas só 1.944 linhas e ~20 nutrientes — usar para alimentos ausentes de TACO/TBCA)
5. `TBCA` (maior cobertura de nutrientes e medidas caseiras, mas licença CC BY-NC-ND — ver nota de licenciamento abaixo)
6. `USDA_SR_LEGACY` / `USDA_FOUNDATION` (fallback internacional)
7. `OPEN_FOOD_FACTS` (produto/barcode apenas)

**Regra dura, reforçada aqui porque o pedido a repete:** a prioridade decide *qual fonte o resolver escolhe quando o usuário não especifica uma*, nunca decide um valor por média entre fontes. Um `FoodNutrientValue` nunca é sobrescrito por outro de fonte diferente — o resolver escolhe **uma linha inteira de uma fonte só** para uma consulta, com `source`/`sourceFoodId` visíveis no resultado.

**Nota de licenciamento (bloqueante para import de bulk):** `tbca.json` documenta licença CC BY-NC-ND 4.0 e pede autorização explícita antes de redistribuir cópia derivada/comercial. Isso não impede uso interno/clínico da TBCA dentro do produto, mas **bloqueia** qualquer exportação pública dos dados brutos da TBCA (ex.: endpoint público de busca de alimentos que devolva o dataset completo). Sinalizar isso na tabela `food_sources` (`redistribution_restricted: true`) e não apenas em prosa, para que qualquer feature futura de exportação consulte a flag.

---

## 4. Nutrient mapping entre as três fontes

O vocabulário canônico é `NutrientCode` (34 códigos hoje em `lib/nutrition/nutrient-vocabulary.ts`). Mapeamento por `sourceNutrientId`:

| `NutrientCode` | TACO `nutrient_id` | POF `nutrient_id` | TBCA `nutrient_id` (padrão observado) |
|---|---|---|---|
| `ENERGY_KCAL` | `taco:energia` | `ibge_pof_2008_2009:energy_kcal` | `tbca:energia:kcal` |
| `PROTEIN` | `taco:proteina` | `ibge_pof_2008_2009:protein_g` | `tbca:proteina:g` |
| `TOTAL_FAT` | `taco:lipideos` | `ibge_pof_2008_2009:fat_g` | `tbca:lipideos:g` |
| `CARBOHYDRATE` | `taco:idrato` *(nome truncado na fonte — na verdade "Carboidrato")* | `ibge_pof_2008_2009:carbohydrate_g` | `tbca:carboidrato:g` |
| `FIBER` | `taco:alimentar` *(truncado de "Fibra Alimentar")* | `ibge_pof_2008_2009:fiber_g` | `tbca:fibra_alimentar:g` |
| `CHOLESTEROL` | `taco:colesterol` | `ibge_pof_2008_2009:cholesterol_mg` | `tbca:colesterol:mg` |
| `SODIUM` | `taco:sodio` | `ibge_pof_2008_2009:sodium_mg` | `tbca:sodio:mg` |
| `CALCIUM` | `taco:calcio` | `ibge_pof_2008_2009:calcium_mg` | `tbca:calcio:mg` |
| `MAGNESIUM` | `taco:magnesio` | `ibge_pof_2008_2009:magnesium_mg` | `tbca:magnesio:mg` |
| `MANGANESE` | `taco:manganes` | `ibge_pof_2008_2009:manganese_mg` | `tbca:manganes:mg` |
| `PHOSPHORUS` | `taco:fosforo` | `ibge_pof_2008_2009:phosphorus_mg` | `tbca:fosforo:mg` |
| `IRON` | `taco:ferro` | `ibge_pof_2008_2009:iron_mg` | `tbca:ferro:mg` |
| `POTASSIUM` | `taco:potassio` | (não visto na amostra lida) | `tbca:potassio:mg` |
| `THIAMIN` | (existe em `nutrient_definitions`, não coberto na amostra) | — | `tbca:tiamina:mg` (confirmado no audit) |
| `NIACIN` | — | — | `tbca:niacina:mg` (confirmado no audit) |
| `VITAMIN_B6` | — | — | `tbca:vitamina_b6:mg` (confirmado no audit) |
| `RIBOFLAVIN` | — | — | `tbca:riboflavina:mg` (confirmado no audit) |

**Achado importante para a implementação real:** os nomes de nutriente da TACO no `nutrient_definitions.json` estão **truncados na fonte** (`"idrato"` em vez de `"Carboidrato"`, `"alimentar"` em vez de `"Fibra Alimentar"`) — provavelmente um bug de parsing do conversor original (`convert_sources.py`, fora deste repositório) que cortou a primeira palavra do nome, mas manteve o `id`/valor corretos. **Não confiar no campo `name` da TACO para o mapeamento** — mapear por `nutrient_id` e validar contra a unidade (`(g)`, `(mg)`, `(kcal)`) e a posição na lista de 40+ nutrientes, cuja ordem é estável (macros primeiro, depois minerais, depois vitaminas). Isso deve ser confirmado lendo o `nutrient_definitions` completo da TACO (56 entradas, ainda não lido além da linha 150) antes de escrever o importador — **ação de pré-implementação, não desta etapa.**

O restante do mapeamento (vitaminas A/C/D/E/K, zinco, cobre, selênio, ácido pantotênico, B12, folato, açúcares, gorduras saturada/mono/poli/trans) segue o mesmo padrão 1:1 por nome normalizado e precisa da mesma varredura completa dos três `nutrient_definitions[]` antes da implementação — a tabela acima cobre os casos já confirmados por leitura direta dos arquivos nesta etapa; o restante é mecânico, mas não deve ser adivinhado.

Nutrientes só-TBCA sem `NutrientCode` (perfil de carboidratos, flavonoides, resposta glicêmica, vitamina A por carotenoides individuais) entram como `unmapped` (seção 2.2) — cobertos por `composicao_alimentos_medidas_caseiras`, mas fora do escopo de macro/micro que a engine consome hoje.

---

## 5. Unit normalization

`NutrientUnit` do projeto já é fechado: `"g" | "mg" | "mcg" | "kcal" | "kJ"`. Regras:

- TACO usa unidades com parênteses no `nutrient_definitions` (`"(g)"`, `"(mg)"`, `"(kcal)"`) — normalizar removendo parênteses antes de comparar com `NutrientUnit`.
- POF usa unidade já limpa (`"kcal"`, `"g"`, `"mg"`).
- TBCA embute a unidade no próprio `nutrient_id` (`tbca:sodio:mg`) — extrair do sufixo, não da unidade solta, porque o audit mostrou `nutrient_unknown_unit: {'Kcal': 95}` em `biodiversidade_e_alimentos_regionais`, ou seja, **pelo menos uma sub-collection da TBCA usa `"Kcal"` (capitalizado) como valor de unidade solta**, não como sufixo do id — precisa de normalização case-insensitive + tabela de sinônimo (`"Kcal"` → `kcal`, `"µg"`/`"mcg"`/`"μg"` → `mcg`) aplicada em ambos os formatos antes de rejeitar como unmapped.
- Conversão de unidade (ex.: µg → mg) **nunca é feita implicitamente** — se a fonte reporta µg e o `NutrientCode` espera mcg, é o mesmo (`mcg` = µg, só nomenclatura), mas mg↔g **não é convertido automaticamter por linha**; se acontecer incompatibilidade real de unidade (ex.: fonte reporta `g` para um nutriente que o vocabulário define como `mg`), o valor entra como `status: "unmapped"` com nota, não como conversão silenciosa — porque converter errado uma vez é pior que não ter o dado.

---

## 6. Basis normalization

```ts
type FoodBasis = "per_100g_food" | "per_100g_edible_portion" | "per_100g_fatty_acids" | "per_100ml";
```

Já enumerado em `nutritional_schema.json`. Todas as três fontes usam `per_100g_edible_portion` como `default_basis` — confirmado por leitura direta dos três cabeçalhos (`taco.json`, `ibge_pof_2008_2009.json` normalization block, e `recommended_integration.default_basis` da TBCA). **Não assumir que basis é sempre esse valor por alimento** — o campo `basis` é lido por registro (`food.basis`), não herdado cegamente do cabeçalho, porque a TBCA pode ter exceções (ex.: perfil de ácidos graxos reportado `per_100g_fatty_acids` em vez de `per_100g_edible_portion` para o alimento inteiro) que só aparecem ao processar o `tbca_completa.json` real.

---

## 7. Status normalization

```ts
type NutrientValueStatus =
  | "reported"
  | "trace"
  | "missing"
  | "not_applicable"
  | "below_reporting_limit"
  | "above_reporting_limit"
  | "present_but_amount_unreliable"
  | "unparsed"
  | "unmapped";     // nutrient_id da fonte sem NutrientCode correspondente — adicionado ao enum do schema comum
```

Mapeamento por fonte, confirmado pelos exemplos lidos:

| Fonte | Status observado na leitura | Mapeia para |
|---|---|---|
| TACO | `"reported"`, `"missing"` (colesterol do arroz integral cozido: `value: null, status: "missing"`) | direto |
| POF | `"reported"`, `"missing"` (colesterol: `value: null, status: "missing", raw: "-"`) | direto |
| TBCA | `"reported"`, `"trace"`, `"not_applicable"`, `"missing"` (`status_distribution` do audit: 215.044 / 5.639 / 9.256 / 11.039 na collection principal) | direto |

**`not_applicable` (TBCA "NA") é distinto de `missing` ("-")** — a fonte já diferencia "não se aplica a este alimento" de "não foi medido/reportado". Preservar essa distinção no canônico em vez de colapsar ambos em `missing`, porque a UI clínica deve poder mostrar "não se aplica" de forma diferente de "sem dado disponível" (ex.: colesterol não se aplica a um vegetal por definição, vs. colesterol não medido em uma carne).

---

## 8. Estratégia para `trace`

Regra: **`trace` nunca vira `0` em nenhuma camada** — nem na importação, nem no resolver, nem no cálculo de plano alimentar.

- No import: `value` fica `null`, `status: "trace"`, `raw` preserva o texto original (`"Tr"`, `"tr"`, "traço").
- No Nutrition Engine: ao somar nutrientes de um plano, um item com `status: "trace"` **não soma como zero silenciosamente** — soma como zero *reportado com uma flag* (`hasTraceContribution: true` agregado no resultado do cálculo), permitindo que a UI mostre "inclui alimento(s) com traço de sódio" em vez de simplesmente omitir. Isso é aditivo sobre o comportamento atual (que já trata ausência como null, conforme `food-safety.ts` e o padrão "unknown → requires_review" documentado em `FOOD-KNOWLEDGE-BASE-ARCHITECTURE.md`).
- 15.774 ocorrências de `trace_as_zero` no audit da TBCA são um **relatório de risco de bug do conversor de origem**, não do modelo canônico — o importador real precisa verificar se `tbca_completa.json` já preserva `status: "trace"` corretamente (o `nutrient_id`+contexto no exemplo do audit sugere que sim, o audit está sinalizando *o padrão a vigiar*, não necessariamente um dado já corrompido) antes de escrever no D1.

---

## 9. Estratégia para `missing`

Regra: **`missing` nunca vira `0`.**

- `value: null`, `status: "missing"` é uma linha válida em `FoodNutrientValue` — não é omitida da tabela (permite ao resolver saber "este nutriente foi verificado e não está disponível" vs. "este nutriente nunca foi consultado para este alimento", que são coisas diferentes).
- POF documenta explicitamente um caso pior: `"Valores 0,00 do PDF são preservados como zero, embora a publicação os descreva como abaixo do limite de quantificação."` — ou seja, **a própria fonte POF já mistura `0` real com "abaixo do limite de quantificação"** antes de chegar ao nosso pipeline. Isso é um limite de qualidade dos dados de origem que o modelo canônico não pode corrigir retroativamente sem a tabela original do IBGE — a mitigação é: ao importar POF, todo valor `0` (não apenas os com `raw: "-"`) recebe `status: "reported"` mas com uma nota (`sourceCaveat: "pof_zero_may_mean_below_quantification_limit"`) em vez de ser tratado como confiável no mesmo nível de TACO/TBCA. Isso é um non-goal de "resolver o problema" e um goal de "não fingir que não existe".

---

## 10. Não fazer média entre fontes — como o resolver deve se comportar

O resolver (`FoodResolver`, hoje em `lib/nutrition/food-resolver.ts`) escolhe **um `CanonicalFood` de uma fonte só** por prioridade (seção 3) ou por escolha explícita do usuário. `FoodNutrientValue` nunca é combinado entre fontes numa mesma consulta. Quando o usuário quer comparar (ex.: UI de "ver fontes alternativas"), o resultado é uma lista de `CanonicalFood` candidatos, cada um com seu próprio conjunto completo de `FoodNutrientValue` — nunca um objeto "mesclado".

---

## 11. Medidas caseiras (measures)

TBCA principal: 8.157 `measures` (rótulos de medida, ex.: "1 xícara de chá", "1 colher de sopa") para 5.875 alimentos (média 1,388/alimento) — e 334.693 `portions` (que são, pela proporção observada — ~41 nutrientes × 8.157 medidas ≈ 334.443, muito próximo de 334.693 — **valores de nutriente já recalculados por medida**, não uma segunda tabela de rótulos). O modelo canônico separa isso em duas tabelas:

- `FoodPortion` (seção 2.4) = os 8.157 rótulos de medida (TBCA) + os rótulos que TACO/POF eventualmente tenham (não observados na amostra lida — TACO/POF no formato comum trazem só `portion` singular por alimento, não uma lista de medidas alternativas).
- `FoodNutrientValue.portionId` (seção 2.3) = os valores de nutriente por medida, reusando a mesma tabela de valores em vez de duplicar o schema de nutriente dentro de cada `FoodPortion`.

Isso também é consistente com a tabela `food_portions` que **já existe** no projeto — a extensão necessária é adicionar `food_id` (FK direta ao `CanonicalFood`, em vez de `food_source + food_ref_id` solto) mantendo `food_source`/`food_ref_id` como estão para não quebrar o código atual (aditivo, não migration destrutiva).

---

## 12. mL sem densidade

26.429 ocorrências de `portion_ml_not_validated` no audit. Regra: **nunca assumir mL = g**. No `FoodPortion`:

- `unit: "ml"` sem uma densidade conhecida para aquele alimento → `gramWeight: null`, `weightSource: "unknown"`, `confidence: "low"`.
- Isso propaga para o Nutrition Engine: uma medida caseira sem `gramWeight` resolvido **não é usada em cálculo de plano** — o resolver de porção (`portion-resolution.ts`, já tem o tipo `PortionGramResolution` com `reason: "MISSING_GRAM_WEIGHT"`) já modela exatamente esse caso de falha; o importador de TBCA deve alimentar esse mesmo contrato, não inventar um novo.
- Densidade conhecida (água, leite, óleo — poucos casos comuns) pode ser uma tabela pequena e curada à parte (`liquid_density_reference`), fora do escopo desta etapa — não implementar até haver um pedido explícito, porque é fácil errar densidade de líquido não-homogêneo (ex.: sopa) e gerar peso incorreto silenciosamente.

---

## 13. Preparo simples

TBCA classifica `foodType` como `"F - Preparo simples do alimento"` (348 ocorrências na amostra) — isso já é dado estruturado em `classification.food_type`, não precisa de inferência adicional. Fica em `CanonicalFood.classification.foodType`. POF tem `preparation.code`/`preparation.name` estruturado por linha. TACO não distingue — nome cru é a única fonte (`extractPreparation` já existente cobre isso).

---

## 14. Alimentos compostos/preparações

TBCA `foodType: "D - Preparação"` é o maior grupo observado (724/1.844 nos tipos amostrados) — são pratos prontos, não ingredientes isolados. O modelo canônico **não tenta decompor** uma preparação da TBCA em ingredientes (isso duplicaria o trabalho que `lib/nutrition/recipes.ts` já faz para receitas cadastradas no próprio produto). Uma `CanonicalFood` com `classification.foodType = "D - Preparação"` é tratada como **alimento atômico com seus próprios nutrientes**, igual a qualquer outro — a diferenciação existe só para exibição/filtro (ex.: não sugerir "arroz com feijão, prato pronto" como substituto direto de "arroz cru").

---

## 15. Produtos industrializados

`composicao_informacao_estatistica_produtos` (307 registros, TBCA) é uma collection **disjunta** da principal (0 `source_food_id` em comum). Estrutura idêntica (mesmo `fields_present`, mesmos ~40 nutrientes médios). Modelo canônico: importa como `CanonicalFood` com `source: "TBCA"`, `sourceCollection: "composicao_informacao_estatistica_produtos"`, `classification.groupCode` provavelmente `"R - Alimentos industrializados"` (categoria já vista na collection principal, mas aqui pode não ter marca/fabricante estruturado — precisa confirmar lendo uma amostra real de `tbca_completa.json`, fora do escopo desta etapa). Não confundir com `MANUFACTURER` do produto — `MANUFACTURER` no projeto é um alimento cadastrado manualmente pela nutricionista (`custom_foods.source = 'MANUFACTURER'`); produtos da TBCA são um catálogo de terceiros, mesma lógica de `TACO`/`TBCA` normal.

---

## 16. Biodiversidade/regional

`biodiversidade_e_alimentos_regionais` (1.340 registros, disjunta) tem só 4,978 nutrientes/alimento em média (vs. 41 da principal) — cobertura muito mais rasa, e tem o problema de unidade já citado (`nutrient_unknown_unit: {'Kcal': 95}`). Importa como `CanonicalFood` com `sourceCollection: "biodiversidade_e_alimentos_regionais"`; **must-fix antes de importar**: normalizar a unidade `"Kcal"` solta (seção 5) — sem isso, 95 valores de energia ficam presos como `unmapped` e o alimento aparece sem calorias, o que é pior que não ter o alimento.

---

## 17. Dados estatísticos da TBCA

`composicao_informacao_estatistica` não vira `CanonicalFood` separado — é a fonte de `standardDeviation`/`minimum`/`maximum`/`numberOfObservations`/`standardError` que enriquece o `FoodNutrientValue` do alimento correspondente na collection principal (join por `source_food_id`, confirmado 100% de correspondência pelo audit: 5.874/5.874). Ao importar, o importador processa `medidas_caseiras` primeiro (cria `CanonicalFood` + `FoodNutrientValue` base), depois processa `estatistica` como um **update aditivo** das mesmas linhas (por `foodId` + `nutrientCode`), nunca cria uma segunda `CanonicalFood`.

---

## Schema D1 proposto

Segue a convenção já usada no projeto (tabelas `snake_case`, `id TEXT PRIMARY KEY`, `TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`, `CHECK` inline para enums, migrations aditivas numeradas). Nomes escolhidos para não colidir com `food_catalog_usda_foods`/`food_catalog_usda_nutrients` já existentes — e para eventualmente **substituir** esse padrão específico de USDA por uma versão genérica, quando fizer sentido migrar (não nesta etapa).

```sql
-- food_sources: metadados estáticos por fonte, não por alimento.
CREATE TABLE food_sources (
  id TEXT PRIMARY KEY,                 -- 'TBCA' | 'TACO' | 'IBGE_POF' | ...
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  license_name TEXT NULL,
  license_url TEXT NULL,
  redistribution_restricted INTEGER NOT NULL DEFAULT 0,
  accessed_at TEXT NOT NULL
);

-- canonical_foods: um alimento por fonte (não deduplicado entre fontes).
CREATE TABLE canonical_foods (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL REFERENCES food_sources(id),
  source_food_id TEXT NOT NULL,
  source_collection TEXT NULL,          -- só TBCA: distingue sub-collections
  name TEXT NOT NULL,
  scientific_name TEXT NULL,
  basis TEXT NOT NULL CHECK (basis IN ('per_100g_food','per_100g_edible_portion','per_100g_fatty_acids','per_100ml')),
  classification_group_code TEXT NULL,
  classification_group_name TEXT NULL,
  classification_food_type TEXT NULL,
  preparation_method TEXT NULL,
  preparation_code TEXT NULL,
  preparation_name TEXT NULL,
  data_origin TEXT NULL CHECK (data_origin IS NULL OR data_origin IN ('analytical','calculated','attributed')),
  source_detail_url TEXT NULL,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, source_food_id, source_collection)
);

-- food_nutrient_values: long-format, um valor por (food, nutriente, [medida]).
CREATE TABLE food_nutrient_values (
  id TEXT PRIMARY KEY,
  food_id TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  nutrient_code TEXT NULL,              -- NULL quando unmapped
  source_nutrient_id TEXT NOT NULL,
  value REAL NULL,
  unit TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'reported','trace','missing','not_applicable','below_reporting_limit',
    'above_reporting_limit','present_but_amount_unreliable','unparsed','unmapped'
  )),
  basis TEXT NOT NULL,
  portion_id TEXT NULL REFERENCES food_portions_v2(id),
  standard_deviation REAL NULL,
  standard_error REAL NULL,
  number_of_observations INTEGER NULL,
  minimum REAL NULL,
  maximum REAL NULL,
  raw TEXT NULL,
  source_caveat TEXT NULL,              -- ex.: 'pof_zero_may_mean_below_quantification_limit'
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- food_portions_v2: medidas caseiras com food_id direto (substitui gradualmente food_portions atual).
CREATE TABLE food_portions_v2 (
  id TEXT PRIMARY KEY,
  food_id TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  quantity REAL NULL,
  unit TEXT NULL,
  gram_weight REAL NULL,
  ml_weight REAL NULL,
  weight_source TEXT NOT NULL CHECK (weight_source IN ('structured_quantity','parsed_from_label','unknown')),
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- food_aliases: variações de nome dentro da MESMA fonte (não matching entre fontes).
CREATE TABLE food_aliases (
  id TEXT PRIMARY KEY,
  food_id TEXT NOT NULL REFERENCES canonical_foods(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_type TEXT NOT NULL CHECK (alias_type IN ('spelling','regional','abbreviation','search_synonym')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Índices

```sql
CREATE UNIQUE INDEX canonical_foods_natural_key_idx
  ON canonical_foods(source, source_food_id, source_collection);
CREATE INDEX canonical_foods_name_idx ON canonical_foods(name);
CREATE INDEX canonical_foods_classification_idx
  ON canonical_foods(classification_group_code, classification_food_type);

CREATE INDEX food_nutrient_values_food_idx ON food_nutrient_values(food_id);
CREATE INDEX food_nutrient_values_nutrient_idx ON food_nutrient_values(nutrient_code);
CREATE UNIQUE INDEX food_nutrient_values_unique_idx
  ON food_nutrient_values(food_id, source_nutrient_id, portion_id);

CREATE INDEX food_portions_v2_food_idx ON food_portions_v2(food_id);

CREATE INDEX food_aliases_food_idx ON food_aliases(food_id);
CREATE INDEX food_aliases_alias_idx ON food_aliases(alias);
```

### FTS

Seguindo o padrão já usado para USDA (`db/...0049...sql`):

```sql
CREATE VIRTUAL TABLE canonical_foods_fts USING fts5(
  food_id UNINDEXED,
  name,
  scientific_name,
  tokenize = 'unicode61'
);
```

Populado por trigger ou pelo próprio importador (a tabela USDA usa o segundo padrão — seguir o mesmo, por consistência).

### Chave natural

`(source, source_food_id, source_collection)` — `source_collection` entra na chave porque a TBCA tem `source_food_id` que podem colidir entre `medidas_caseiras` e `informacao_estatistica_produtos` em teoria (não confirmado, mas não é seguro assumir que os namespaces de ID nunca colidem entre sub-collections diferentes sem checar o dado real).

### IDs canônicos

`{source_lowercase}:{source_collection_short}:{source_food_id}`, ex.:

- `taco:1`
- `ibge_pof:6300101:99` (a própria fonte já usa `codigo:preparo` como identidade composta, visto no `id` original `"ibge_pof_2008_2009:6300101:99"`)
- `tbca:medidas_caseiras:BRC0001C`
- `tbca:produtos:BRC0307P` (exemplo de formato, não confirmado — produtos podem ter prefixo diferente, checar no dado real)

Manter o prefixo de fonte no ID (em vez de um UUID opaco) porque facilita debug/auditoria e é o mesmo padrão que a TBCA já sugere em `suggested_record_shape.id = "tbca:<food_id>"`.

---

## Estratégia de deduplicação

**Dentro da mesma fonte:** dedup só remove duplicata **exata e comprovada por auditoria** — o único caso confirmado é `medidas_caseiras_personalizadas` (não importar essa sub-collection, ponto). Nomes normalizados colidindo (TBCA: 74 colisões) não são deduplicados — viram `food_aliases` ou permanecem como registros distintos com `source_food_id` diferente (podem ser variações reais, ex.: duas cultivares).

**Entre fontes:** **não há deduplicação automática.** TACO "Arroz, integral, cozido" (id 1) e TBCA "BRC0001C" (também arroz, pelo padrão do ID) e POF "6300101:99" **permanecem `CanonicalFood` completamente separados**, cada um com seu próprio ID e nutrientes. Isso é uma decisão deliberada, consistente com a regra "não fazer média entre fontes" — combinar exigiria um `canonical_group` como a V3 auditada em `FOOD-KNOWLEDGE-BASE-ARCHITECTURE.md` já tem (`canonical_foods`/`canonical_food_source_links`), e aquele documento já registrou que 456 desses grupos estão `PENDING_MANUAL_REVIEW` e não podem ser autoridade nutricional. Não repetir esse problema aqui: cross-source grouping fica para uma fase futura opcional de "ver alimentos equivalentes" na UI, nunca para fusão de dado.

---

## Estratégia de matching entre alimentos equivalentes

Fora do escopo de importação (que não faz matching), mas para a futura UI "ver esta mesma comida em outra fonte":

1. Normalizar nome (reaproveitar `normalizeFoodText`/`tokenizeFoodQuery` de `lib/nutrition/food-terminology.ts`, já testado em produção).
2. Match candidato = nome normalizado idêntico OU todos os tokens presentes nas duas direções.
3. **Nunca auto-aceitar** um match cross-source como identidade — sempre apresentar como sugestão (`possibleEquivalents: CanonicalFood[]`), igual ao padrão `AMBIGUOUS` que `food-resolver.ts` já usa para resolução dentro de uma fonte.
4. Esse relacionamento, se implementado, vira uma tabela `food_equivalence_candidates` separada (fora de escopo desta etapa) — nunca escrito de volta em `canonical_foods` ou `food_nutrient_values`.

---

## Estimativa de número de linhas

| Tabela | Fonte | Estimativa |
|---|---:|---:|
| `canonical_foods` | TACO | 597 |
| `canonical_foods` | IBGE_POF | 1.944 |
| `canonical_foods` | TBCA (`medidas_caseiras` + `estatistica_produtos` + `biodiversidade`) | 5.875 + 307 + 1.340 = 7.522 |
| `canonical_foods` | **total** | **≈ 10.063** |
| `food_nutrient_values` | TACO | 597 × ~50 nutrientes (56 `nutrient_definitions` declarados) ≈ 30.000 |
| `food_nutrient_values` | IBGE_POF | 1.944 × ~20 nutrientes ≈ 39.000 |
| `food_nutrient_values` | TBCA base (`medidas_caseiras`, per-100g) | 240.978 (direto do audit) |
| `food_nutrient_values` | TBCA por medida (`medidas_caseiras`, portion-level) | 334.693 (direto do audit) |
| `food_nutrient_values` | TBCA estatística (update aditivo, não novas linhas) | 0 linhas novas, ~239.748 updates |
| `food_nutrient_values` | TBCA produtos + biodiversidade | 307×~40 + 1.340×~5 ≈ 19.180 |
| `food_nutrient_values` | **total** | **≈ 664.000 linhas** |
| `food_portions_v2` | TBCA | 8.157 (direto do audit) |
| `food_portions_v2` | TACO/POF | ~0–597/1.944 se decidirmos extrair `portion` singular como uma linha — a confirmar, provavelmente não vale a pena para uma medida só |
| `food_aliases` | TBCA | ~74 colisões conhecidas, resto a confirmar no dado completo |

Total ficará bem abaixo de qualquer limite prático do D1 (limite de tamanho de banco é 10 GB no plano pago; ~664 mil linhas de nutriente em long-format, com colunas majoritariamente numéricas/curtas, deve ficar na casa de dezenas de MB, não centenas — muito abaixo do arquivo bruto de 610 MB da TBCA, que inclui JSON verboso/redundante por registro).

---

## Estratégia de importação incremental/versionada

Reaproveita `import_batches` (já existe, `db/...0050...sql`) sem alterar seu schema:

1. **Por fonte, um `import_batches` por execução.** `source` = `'TBCA'` | `'TACO'` | `'IBGE_POF'`, `dataset_version` = `'7.3'` | `'4ª edição...'` | `'2008–2009'`.
2. **Streaming, nunca carregar o JSON inteiro em memória** — obrigatório para `tbca_completa.json` (610 MB); o próprio script de auditoria (`tbca_audit.py`) já processa via streaming em 26,4s para 19.271 registros, então o padrão de leitura streaming já está provado e deve ser reaproveitado/portado para o importador real, não reinventado.
3. **Dry-run obrigatório antes de qualquer escrita**, seguindo exatamente a política `CREATE` / `NOOP` / `ENRICH` / `CONFLICT` / `REJECT` já definida em `FOOD-KNOWLEDGE-BASE-ARCHITECTURE.md` — mas como aqui não há fusão entre fontes (seção "dedup" acima), `ENRICH`/`CONFLICT` só se aplicam **dentro da mesma fonte** entre execuções de import diferentes (ex.: reimportar TBCA 7.4 sobre TBCA 7.3 no futuro).
4. **Ordem de import por fonte:** TACO primeiro (menor, mais confiável, já usada em produção), depois IBGE_POF, depois TBCA por sub-collection na ordem `medidas_caseiras` → `informacao_estatistica` (update aditivo) → `informacao_estatistica_produtos` → `biodiversidade_e_alimentos_regionais` (a que tem mais problema de unidade, importar por último, depois de validar o fix da seção 5 num dry-run isolado).
5. **Batches pequenos** (mesma diretriz já registrada) — para os ~664 mil `food_nutrient_values`, inserir em lotes de alguns milhares de linhas por transação D1, respeitando limite de 100 parâmetros/query e 30s/query já documentados.
6. **Rollback por `import_batches.id`** — cada linha em `canonical_foods` carrega `import_batch_id`; um `DELETE FROM canonical_foods WHERE import_batch_id = ?` (com `ON DELETE CASCADE` já cobrindo `food_nutrient_values`/`food_portions_v2`/`food_aliases`) desfaz uma importação inteira sem tocar em outras fontes.
7. **Versionamento futuro:** se uma nova versão da mesma fonte aparecer (TBCA 7.4, TACO 5ª edição), a chave natural muda (`source_food_id` pode ser igual mas o conteúdo mudar) — nesse caso a estratégia é um novo `import_batches` com `dataset_version` novo, e decisão explícita (não automática) sobre se a versão antiga é mantida em paralelo (`canonical_foods` teria duas linhas com mesma `source_food_id` mas `source_collection`/versão diferente — a chave natural atual não cobre isso ainda; **ação futura, não desta etapa**: adicionar `source_version` à chave natural se/quando isso acontecer de fato).

---

## O que fica fora desta etapa (confirmando os limites do pedido)

- Nenhuma migration `.sql` foi criada.
- Nenhum dado foi importado.
- `lib/nutrition/*` (Nutrition Engine) não foi alterado.
- `tbca_completa.json` não foi lido diretamente — todo o desenho de TBCA usa `tbca-audit-summary.md` + `tbca-audit-report.json` como representação estrutural, como pedido.
- Pontos marcados explicitamente como "a confirmar no dado real" (mapeamento completo de nutrientes, formato de ID de `informacao_estatistica_produtos`, presença de `portion` estruturado em TACO/POF além do singular já visto) precisam de uma segunda passada de leitura *antes* da implementação do importador — não são bloqueadores deste desenho, mas são bloqueadores da próxima etapa.

---

**CANONICAL_NUTRITION_MODEL_READY: sim**
