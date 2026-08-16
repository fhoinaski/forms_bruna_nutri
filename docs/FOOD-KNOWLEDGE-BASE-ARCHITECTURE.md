# Food Knowledge Base V3 - arquitetura de integracao

Data da auditoria: 2026-08-16

Arquivo auditado: `F:\Downloads\food_knowledge_base_v3.sqlite`

## Decisao

Adotar uma arquitetura hibrida, aditiva e feature-flagged:

```text
Bruna Nutri
  |
  |-- Food Catalog Core em D1
  |     |-- TACO atual preservada
  |     |-- TBCA selecionada
  |     |-- USDA selecionado somente quando elegivel
  |     |-- CUSTOM / MANUFACTURER atuais preservados
  |     |-- porcoes locais por source/source_id
  |
  |-- Food Knowledge Base V3 externa
  |     |-- fonte de auditoria/importacao controlada
  |     |-- nunca entra no bundle Next.js
  |     |-- nunca e importada inteira automaticamente
  |
  |-- Produto externo por barcode
        |-- cache local com TTL/provenance
        |-- Open Food Facts apenas por lookup controlado
```

Esta decisao corresponde a opcao B do briefing: catalogo core local + lookup externo de produto.

## Por que nao importar tudo para D1 agora

A V3 tem 274.219.008 bytes no arquivo SQLite local, sem contar overhead de importacao, indices D1, crescimento de dados clinicos do app e futuras tabelas de cache. D1 Paid suporta 10 GB por database, mas cada database processa queries de forma serial, tem limite de 100 parametros por query, 30 segundos por query e limite de 2 MB por row/string/blob. Portanto, tamanho bruto nao e o unico criterio; throughput, batch operacional e ranking de busca pesam mais.

A V3 tambem contem sinais de qualidade que impedem importacao cega:

- `food_clinical_traits` confirmado: 0.
- `clinical_trait_candidates`: 2.381, todos pendentes e `human_verified = 0`.
- `canonical_group_audits`: 456 grupos pendentes de review manual.
- grupos canonical gigantes, por exemplo soy milk unsweetened com 2.214 source records.
- `foods_fts` tem 95.775 linhas, mas so indexa USDA; TACO/TBCA/OFF nao aparecem no FTS.
- `validation_issues`: 117, incluindo 10 `NEGATIVE_NUTRIENT`.
- nutrientes USDA Foundation muito incompletos para os quatro macros principais nesta copia.

## Auditoria real da V3

Comando reproduzivel:

```bash
node scripts/audit-food-kb-v3.mjs F:\Downloads\food_knowledge_base_v3.sqlite
```

Resumo direto do SQLite:

| Item | Resultado |
| --- | ---: |
| Tamanho do arquivo | 274.219.008 bytes |
| `PRAGMA integrity_check` | `ok` |
| `PRAGMA foreign_key_check` | 0 violações |
| `foods` | 96.572 |
| `canonical_foods` | 25.750 |
| `canonical_food_source_links` | 96.572 |
| `food_nutrients` | 96.472 |
| `food_portions` | 18.322 |
| `food_ingredients` | 874 |
| `food_aliases` | 96.572 |
| `provenance` | 221.262 |
| `clinical_trait_candidates` | 2.381 |
| `food_clinical_traits` | 0 |
| `canonical_group_audits` | 456 |
| `food_match_candidates` | 4.814 |
| `validation_issues` | 117 |
| `v3_rejected_records` | 18 |

Contagem por fonte em `foods`:

| Fonte | Registros |
| --- | ---: |
| USDA_FOUNDATION | 87.982 |
| USDA_SR_LEGACY | 7.793 |
| TACO | 597 |
| OPEN_FOOD_FACTS | 100 |
| TBCA | 100 |

Contagem por fonte em `food_nutrients`:

| Fonte | Registros |
| --- | ---: |
| USDA_FOUNDATION | 87.982 |
| USDA_SR_LEGACY | 7.793 |
| TACO | 597 |
| OPEN_FOOD_FACTS | 100 |

Observacao: `TBCA` aparece em `foods`, `food_aliases`, `food_source_links` e `provenance`, mas nao apareceu em `food_nutrients` nesta copia auditada.

Qualidade de nutrientes por fonte:

| Fonte | Linhas | kcal NULL | proteina NULL | carboidrato NULL | gordura NULL |
| --- | ---: | ---: | ---: | ---: | ---: |
| OPEN_FOOD_FACTS | 100 | 3 | 5 | 4 | 4 |
| TACO | 597 | 6 | 21 | 15 | 37 |
| USDA_FOUNDATION | 87.982 | 87.847 | 86.572 | 87.605 | 83.226 |
| USDA_SR_LEGACY | 7.793 | 0 | 0 | 0 | 0 |

Canonical groups de maior risco:

| Source records | Nome | Status |
| ---: | --- | --- |
| 2.214 | SOY MILK, UNSWEETENED, PLAIN, SHELF STABLE | PENDING_MANUAL_REVIEW |
| 1.798 | ALMOND MILK, UNSWEETENED, PLAIN, SHELF STABLE | PENDING_MANUAL_REVIEW |
| 995 | peanut butter, creamy | PENDING_MANUAL_REVIEW |
| 718 | Alaska Pollock, raw | PENDING_MANUAL_REVIEW |
| 621 | Oil, sunflower | PENDING_MANUAL_REVIEW |
| 621 | Oil, safflower | PENDING_MANUAL_REVIEW |
| 619 | Oil, olive, extra light | PENDING_MANUAL_REVIEW |
| 617 | Oil, peanut | PENDING_MANUAL_REVIEW |

## Arquitetura atual do projeto

O projeto hoje usa:

- `lib/nutrition/data/taco.json` e `taco-complementar.json` carregados no bundle server/client via `lib/nutrition/taco.ts`.
- `searchAllFoods` em `lib/nutrition/food-search.ts`, puro e sincrono, unificando TACO/complementar + `customFoods` carregados pelo chamador.
- `custom_foods` para alimentos `CUSTOM` e `MANUFACTURER`.
- `food_portions` local, ligada a `food_source` + `food_ref_id`, agora aceita `TACO`, `CUSTOM` e `MANUFACTURER`.
- `meal_plan_items.food_source` e `meal_plan_items.food_ref_id`, hoje com enum `TACO`, `CUSTOM`, `MANUFACTURER`.
- snapshots nutricionais em planos versionados, preservando historico mesmo se a base mudar.
- `food_clinical_traits` local, com provenance permitida apenas de dados confirmados/curados.
- `food-safety.ts` com regra segura: dado desconhecido vira `unknown`, e a policy de substituicao transforma isso em revisao quando aplicavel.

## Politica de identidade

Novo codigo deve usar identidade estavel:

```ts
type FoodSource =
  | "TACO"
  | "TBCA"
  | "USDA_FOUNDATION"
  | "USDA_SR_LEGACY"
  | "OPEN_FOOD_FACTS"
  | "CUSTOM"
  | "MANUFACTURER";

type FoodReference = {
  foodId: string;
  source: FoodSource;
  sourceId: string;
  canonicalId?: string | null;
};
```

Nome nunca deve ser identidade. Nome e apenas dado de exibicao/busca.

## Politica de source priority

Ranking inicial:

1. `CUSTOM` quando criado pela nutricionista.
2. `MANUFACTURER` quando e produto cadastrado manualmente.
3. `TACO` para alimentos brasileiros basicos.
4. `TBCA` selecionada para lacunas brasileiras.
5. `USDA_SR_LEGACY` somente quando nutrientes basicos estiverem completos e fonte for util.
6. `USDA_FOUNDATION` somente quando o registro tiver nutrientes necessarios para o caso de uso.
7. `OPEN_FOOD_FACTS` apenas produto/barcode/cache, nunca como alimento basico prioritario.

Canonical food nao e fonte nutricional. Se um canonical group estiver em `PENDING_MANUAL_REVIEW` ou tiver grupo excessivo, ele nao pode ser usado como autoridade clinica ou nutricional. Deve-se usar um source food especifico.

## Modelo de dados recomendado

Migrations futuras devem ser aditivas:

- ampliar enums/checks para aceitar `TBCA`, `USDA_FOUNDATION`, `USDA_SR_LEGACY`, `OPEN_FOOD_FACTS` onde fizer sentido.
- criar uma tabela core, se a importacao for para D1:
  - `food_catalog_core`
  - `food_catalog_nutrients`
  - `food_catalog_aliases`
  - `food_catalog_portions`
  - `food_catalog_provenance`
- manter `custom_foods`, `manufacturer`, `food_portions` e `food_clinical_traits` existentes.
- nao migrar planos antigos destrutivamente.

## Estrategia de importacao

Antes de qualquer escrita real:

1. rodar auditoria read-only;
2. selecionar fontes explicitamente;
3. dry-run obrigatorio;
4. calcular duplicidades por `source + source_id`;
5. rejeitar registros sem nome, sem source_id ou com qualidade incompativel;
6. preservar NULL de nutriente;
7. importar em batches pequenos;
8. registrar provenance;
9. medir busca em dataset importado;
10. permitir rollback por migration reversivel ou delete por `import_run_id`.

Criterios iniciais de core:

- sempre incluir TACO atual e TACO V3 reconciliada;
- incluir TBCA V3 apenas se tiver nutrientes suficientes e licenca/uso validos;
- incluir USDA somente por allowlist de lacunas reais ou uso frequente;
- nao usar `LIMIT 10000`;
- incluir alimentos existentes em planos atuais, se houver match seguro por identidade antiga.

## Busca

O servico alvo deve ser unico:

```ts
searchFoods({ query, limit, source, patientContext })
```

Ranking deterministico:

1. source filter explicito;
2. match exato de nome/alias;
3. prefix;
4. FTS/local index;
5. prioridade de fonte;
6. qualidade;
7. idioma/regiao;
8. menor comprimento/distance.

Teste manual na V3 por `LIKE` confirmou que `arroz`, `feijao`, `banana`, `ovo`, `leite`, `frango`, `pao`, `aveia` conseguem trazer TACO primeiro quando o ranking prioriza fonte brasileira. O FTS da V3, porem, falha para busca brasileira porque nao indexa TACO/TBCA/OFF nesta copia.

## Open Food Facts

Nao fazer search-as-you-type contra OFF. A documentacao atual informa rate limits de 15 req/min/IP para product read e 10 req/min/IP para search, pede `User-Agent` customizado e alerta que dados podem ser incompletos ou imprecisos.

Estrategia:

- lookup por barcode;
- cache local com `fetched_at`, `source_updated_at`, `source_url`, `raw/normalized`;
- TTL/refresh explicito;
- attribution/licenca documentada antes de uso amplo;
- alergênicos/traces entram como dados externos, nao como `PROFESSIONAL` nem `SYSTEM_CURATED`.

## Seguranca clinica

Clinical candidates da V3 permanecem candidates.

Regra obrigatoria:

```text
candidate != verified trait
unknown -> requires_review
```

`food-safety.ts` nao deve considerar `clinical_trait_candidates` como compatibilidade. No maximo, eles podem alimentar uma UI de revisao profissional ou observabilidade.

## Checkpoint antes de importacao

Nenhum dado da V3 foi importado nesta etapa.

Proposta para a primeira importacao controlada:

- Quantidade: TACO V3 completa para comparacao + TBCA somente registros com nutrientes basicos presentes. USDA/OFF ficam fora.
- Fontes: `TACO`, `TBCA`.
- Tamanho estimado: muito abaixo dos 274 MB completos; estimativa exata deve vir do dry-run do importador.
- Impacto D1: baixo em storage, mas requer ampliar enums e indices por `source/source_id`.
- Rollback: cada importacao deve carregar `import_run_id` e permitir delete por run.
- Compatibilidade: planos antigos continuam por `food_source = TACO` numerico e snapshots; novos registros usam `source/source_id` V3 sem sobrescrever legado.

Nao prosseguir para importacao grande sem dry-run e aprovacao explicita.

## Fase 3 - importador controlado dry-run

Implementado um importador somente dry-run:

```bash
npm run food-kb:import -- --db "F:\Downloads\food_knowledge_base_v3.sqlite" --source TACO --dry-run
npm run food-kb:import -- --db "F:\Downloads\food_knowledge_base_v3.sqlite" --source TBCA --dry-run
```

Escopo deliberado:

- fontes aceitas: `TACO` e `TBCA`;
- fontes bloqueadas nesta fase: USDA, Open Food Facts, canonical groups e clinical candidates;
- identidade: `source + source_id`, com normalizacao de `TACO4:<numero>` para reconciliar com a TACO atual;
- sem escrita em D1;
- sem migration nova nesta fase, porque o runtime continua usando TACO JSON + `custom_foods` e o importador ainda so gera plano/report;
- `NULL` de nutriente continua diferente de zero;
- aliases sao relatados, mas nao traduzidos nem importados automaticamente;
- porcoes sao relatadas, mas a V3 auditada nao tem porcoes para `TACO`/`TBCA`.

Politica central do dry-run:

| Acao | Regra |
| --- | --- |
| `CREATE` | identidade `source + source_id` nao existe no catalogo atual |
| `NOOP` | match exato ou projeto atual tem dado mais completo |
| `ENRICH` | V3 preencheria apenas campo nulo no destino |
| `CONFLICT` | divergencia nutricional nao e sobrescrita |
| `REJECT` | fonte/identidade/nome/nutriente invalido |

Resultados reais gerados em 2026-08-16:

| Fonte | Found | Eligible | Existing | New | Enrich | Conflicts | Rejected | Aliases | Portions | Planned rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TACO | 597 | 593 | 593 | 0 | 0 | 0 | 4 | 597 | 0 | 0 |
| TBCA | 100 | 0 | 0 | 0 | 0 | 0 | 100 | 100 | 0 | 0 |

Relatorios:

- `reports/food-kb-taco-reconciliation.json`
- `reports/food-kb-tbca-dry-run.json`

Observacoes:

- TACO nao duplica o catalogo atual: 330 `EXACT_MATCH`, 263 `EXISTING_ENRICHES_V3`, 0 `V3_ONLY`, 0 `VALUE_CONFLICT`.
- TACO rejeitou 4 linhas por `NEGATIVE_carbohydrateG`: `TACO4:288`, `TACO4:322`, `TACO4:337`, `TACO4:400`.
- TBCA foi tecnicamente lida, mas os 100 registros foram rejeitados por `NUTRIENTS_NOT_FOUND` nesta copia da V3.
- Importacao real de TBCA permanece bloqueada ate confirmar licenca/uso permitido e disponibilidade de nutrientes.

## Fase 4 - catalogo unificado e search service

Implementada uma camada runtime unica para busca/resolucao, sem importar V3 e sem copiar TACO para D1:

- `lib/nutrition/food-catalog.ts`
- `searchFoods({ query, limit, sources })`
- `getFoodByReference(ref)`
- `getFoodPortions(ref)`

Fontes runtime nesta fase:

| Fonte logica | Storage atual | Observacao |
| --- | --- | --- |
| `TACO` | `taco.json` em memoria | preservada sem migration |
| `COMPLEMENTARY` | `taco-complementar.json` em memoria | identidade nova no search; persistencia de plano continua `TACO` por compatibilidade |
| `CUSTOM` | `custom_foods` | preservada |
| `MANUFACTURER` | `custom_foods` com `source = MANUFACTURER` | preservada |

`USDA` e `OPEN_FOOD_FACTS` existem apenas no tipo de referencia futura. Nao foram implementados no runtime.

Identidade exposta:

```ts
type FoodReference = {
  source: "TACO" | "COMPLEMENTARY" | "CUSTOM" | "MANUFACTURER" | "USDA" | "OPEN_FOOD_FACTS";
  sourceId: string;
  canonicalId?: string | null;
};
```

O endpoint `GET /api/admin/foods/search` agora usa o catalogo unificado e devolve `ref`/`sourceLabel` junto com os campos legados (`numero`, `descricao`, `fonte`) para compatibilidade progressiva com o MealPlanEditor.

Ranking deterministico:

1. nome exato;
2. alias exato, hoje usado para marca de `MANUFACTURER`;
3. prefix;
4. contains;
5. token match;
6. prioridade de fonte;
7. ordem original da fonte;
8. distancia/tamanho/nome.

Medicao local em 2026-08-16, usando `searchFoods` com TACO+COMPLEMENTARY em memoria, 72 execucoes totais, `limit = 20`:

| Metrica | Resultado |
| --- | ---: |
| p50 | 1,26 ms |
| p95 | 2,73 ms |
| max | 4,99 ms |

Primeiro resultado medido por consulta comum:

| Query | Primeiro resultado |
| --- | --- |
| `arroz` | Arroz, integral, cozido |
| `arroz cozido` | Arroz, integral, cozido |
| `banana` | Banana, da terra, crua |
| `leite` | Leite, condensado |
| `ovo` | Ovo, de codorna, inteiro, cru |
| `feijão` | Feijão, broto, cru |
| `batata` | Batata, baroa, cozida |
| `frango` | Frango, asa, com pele, crua |
| `acai` | Açaí, polpa, com xarope de guaraná e glucose |

Limite seguro: `searchFoods` corta resultados em no maximo 50 e ignora query normalizada com menos de 2 caracteres.

Compatibilidade:

- planos antigos continuam resolvendo por snapshots primeiro;
- sem snapshot, `food_source/food_ref_id` continuam com prioridade sobre nome;
- novos itens `COMPLEMENTARY` selecionados no editor ainda persistem como `TACO + sourceId`, porque o schema atual e os resolvers legados ja tratam `taco-complementar.json` dentro de `getTacoFoodByNumber`;
- a resposta do endpoint ja carrega `ref.source = COMPLEMENTARY` para permitir uma migration futura sem refatorar a UI.

## Fase 5 - porcoes e medidas caseiras

Implementada a camada unificada de porcoes sem importar novos dados da V3 e sem inventar medidas:

- `lib/nutrition/portion-resolution.ts` define `UnifiedFoodPortion`, normalizacao de unidades brasileiras e `resolvePortionToGrams`.
- `getFoodPortions(ref)` agora retorna porcoes de dominio com `foodRef`, `label`, `unitKind`, `gramWeight`, `source`, `provenance` e `confidence`.
- `food_portions` foi migrada de forma aditiva para aceitar `MANUFACTURER` como fonte real, sem persistir produto de fabricante como `CUSTOM`.
- `food_portions` ganhou indice unico parcial para impedir duplicidade ativa de descricao por alimento.
- `PATCH /api/admin/foods/portions/[id]` edita descricao, gramagem, origem, versao e confianca.
- `DELETE /api/admin/foods/portions/[id]` continua sendo desativacao logica, nunca delete fisico.
- `meal_plan_items` agora guarda `resolved_grams_snapshot` e `quantity_resolution_snapshot`.
- o snapshot versionado do plano inclui a gramagem resolvida, entao historico nao muda se a medida for corrigida depois.
- `resolveQuantity` passa a respeitar `portion_snapshot` antes da porcao atual cadastrada.

Cobertura auditada antes/depois:

| Camada | Antes da Fase 5 | Depois da Fase 5 |
| --- | --- | --- |
| Seed local TACO | 6 porcoes cadastradas | 6 porcoes preservadas |
| Complementar | 0 porcoes proprias | sem porcoes inventadas; resolve via `TACO` quando persistido assim |
| Custom | cadastro/listagem/desativacao | cadastro/listagem/edicao/desativacao |
| Manufacturer | schema de plano aceitava, `food_portions` bloqueava | `food_portions` aceita `MANUFACTURER` |
| Historico do plano | id da medida + snapshot nutricional | id da medida + snapshot nutricional + gramas resolvidos |

Regra operacional: volume (`ml`, `l`) nao vira grama com confianca alta sem medida especifica cadastrada. A camada continua marcando conversoes genericas como estimativa e recomenda cadastro profissional da porcao quando a precisao importa.

## Fase 6 - composicao nutricional ampliada

Implementada a base de modelo para composicao nutricional ampliada sem importar USDA real:

- `lib/nutrition/nutrient-vocabulary.ts` centraliza codigos internos, labels, unidades e colunas V3.
- `lib/nutrition/nutrients.ts` calcula/agrega macros, minerais, vitaminas, lipidios, acucares e colesterol quando a referencia possui esses campos.
- `nutrition_snapshot` permanece JSON e agora pode carregar os campos ampliados; planos historicos continuam protegidos sem dezenas de novas colunas.
- `food_catalog_usda_foods` + `food_catalog_usda_nutrients` usam modelo LONG para USDA selecionado.
- `USDA` entrou no catalogo unificado como provider preparado, sem misturar com TACO e sem copiar TACO para D1.
- `meal_plan_items.food_source` passa a aceitar `USDA`, preservando `source + sourceId`.

### Matriz nutricional atual

| Nutriente | Codigo interno | TACO JSON | Custom/Manufacturer | Meal Plan | UI atual | Unidade |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Energia | `ENERGY_KCAL` | sim | sim | sim | sim | kcal |
| Energia | `ENERGY_KJ` | nao | nao | snapshot/provider | nao | kJ |
| Proteina | `PROTEIN` | sim | sim | sim | sim | g |
| Carboidrato | `CARBOHYDRATE` | sim | sim | sim | sim | g |
| Acucares | `SUGARS` | nao | nao | snapshot/provider | nao | g |
| Gordura total | `TOTAL_FAT` | sim | sim | sim | sim | g |
| Gordura saturada | `SATURATED_FAT` | nao | nao | snapshot/provider | nao | g |
| Gordura monoinsaturada | `MONOUNSATURATED_FAT` | nao | nao | snapshot/provider | nao | g |
| Gordura poli-insaturada | `POLYUNSATURATED_FAT` | nao | nao | snapshot/provider | nao | g |
| Gordura trans | `TRANS_FAT` | nao | nao | snapshot/provider | nao | g |
| Fibras | `FIBER` | sim | sim | sim | sim | g |
| Sodio | `SODIUM` | sim | sim | sim | sim | mg |
| Calcio | `CALCIUM` | sim | sim | sim | sim | mg |
| Ferro | `IRON` | sim | sim | sim | sim | mg |
| Magnesio | `MAGNESIUM` | nao | nao | snapshot/provider | nao | mg |
| Fosforo | `PHOSPHORUS` | nao | nao | snapshot/provider | nao | mg |
| Potassio | `POTASSIUM` | sim | sim | sim | sim | mg |
| Zinco | `ZINC` | nao | nao | snapshot/provider | nao | mg |
| Cobre | `COPPER` | nao | nao | snapshot/provider | nao | mg |
| Manganes | `MANGANESE` | nao | nao | snapshot/provider | nao | mg |
| Selenio | `SELENIUM` | nao | nao | snapshot/provider | nao | mcg |
| Vitamina A | `VITAMIN_A` | nao | nao | snapshot/provider | nao | mcg |
| Vitamina C | `VITAMIN_C` | sim | sim | sim | sim | mg |
| Vitamina D | `VITAMIN_D` | nao | nao | snapshot/provider | nao | mcg |
| Vitamina E | `VITAMIN_E` | nao | nao | snapshot/provider | nao | mg |
| Vitamina K | `VITAMIN_K` | sem coluna V3 nesta copia | nao | preparado | nao | mcg |
| Tiamina/B1 | `THIAMIN` | nao | nao | snapshot/provider | nao | mg |
| Riboflavina/B2 | `RIBOFLAVIN` | nao | nao | snapshot/provider | nao | mg |
| Niacina/B3 | `NIACIN` | nao | nao | snapshot/provider | nao | mg |
| Acido pantotenico/B5 | `PANTOTHENIC_ACID` | sem coluna V3 nesta copia | nao | preparado | nao | mg |
| Vitamina B6 | `VITAMIN_B6` | nao | nao | snapshot/provider | nao | mg |
| Folato/B9 | `FOLATE` | nao | nao | snapshot/provider | nao | mcg |
| Vitamina B12 | `VITAMIN_B12` | nao | nao | snapshot/provider | nao | mcg |
| Colesterol | `CHOLESTEROL` | nao | nao | snapshot/provider | nao | mg |

### Decisao WIDE vs LONG

Para USDA selecionado, foi escolhido modelo LONG:

```text
food_catalog_usda_foods
food_catalog_usda_nutrients(food_id, nutrient_code, value, unit, basis)
```

Motivo: dezenas de nutrientes, unidades diferentes, fonte/provenance por valor e expansao futura. O volume estimado do dry-run fica confortavel para D1 quando limitado a registros selecionados.

### USDA dry-run real

Comando executado em 2026-08-16:

```bash
npm run food-kb:import -- --db "F:\Downloads\food_knowledge_base_v3.sqlite" --source USDA --dry-run --report reports/food-kb-usda-dry-run.json
```

Resultado:

| Metrica | Resultado |
| --- | ---: |
| USDA encontrados | 95.775 |
| Elegiveis | 7.790 |
| Rejeitados | 87.985 |
| Novos planejados | 7.790 |
| Nutrient rows estimadas | 226.872 |
| Provenance rows estimadas | 7.790 |
| Storage estimado | 34,35 MB |
| Importacao real | 0 rows gravadas |

Criterios de selecao USDA V1:

- target `USDA` agrega `USDA_FOUNDATION` e `USDA_SR_LEGACY`, mas preserva `upstream_source` no `sourceId`/provenance;
- exige base `100_g`;
- exige kcal, proteina, carboidrato e gordura;
- rejeita nutrientes negativos;
- rejeita branded foods;
- rejeita recipes;
- rejeita duplicidade por nome normalizado no conjunto avaliado;
- rejeita registros ligados a canonical group com `HIGH`/`MEDIUM` pendente de revisao.

Observacao: 7.790 elegiveis e maior que a meta inicial sugerida de 2.000-5.000, mas veio de criterio objetivo sobre o dataset real, principalmente USDA SR Legacy com macros completos. Antes de import real, recomenda-se uma revisao adicional por grupos de alimentos/termos de prescricao para reduzir para uma allowlist operacional.

Rollback planejado para import real futuro:

- todo alimento USDA importado deve carregar `import_run_id`;
- nutrientes e foods ficam em tabelas dedicadas;
- rollback pode deletar por `import_run_id` em `food_catalog_usda_foods`, com cascade para nutrientes;
- planos ja prescritos permanecem protegidos por `nutrition_snapshot`.

### Performance apos provider USDA

Medição local em 2026-08-16 com D1 remoto configurado e tabelas USDA vazias, 5 execuções por consulta:

| Query | p50 | max |
| --- | ---: | ---: |
| `arroz` | 184 ms | 299 ms |
| `banana` | 174 ms | 183 ms |
| `feijao` | 172 ms | 180 ms |
| `ovo` | 179 ms | 182 ms |
| `leite` | 175 ms | 182 ms |
| `frango` | 175 ms | 178 ms |
| `rice` | 344 ms | 349 ms |

O catalogo evita consultar USDA por padrao quando ja ha candidatos locais/TACO para a query. USDA e consultado quando o filtro pede `USDA` explicitamente ou quando a busca local nao encontra candidato, preservando prioridade brasileira sem esconder termo ingles especifico.
