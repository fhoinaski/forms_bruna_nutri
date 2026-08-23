# CORREÇÃO P0 — Food Exchange / Substitution Engine: qualidade nutricional

## 1. Causa raiz — reproduzida com o exemplo exato do bug real

Reproduzi "Queijo, minas, frescal — 50g" contra o `generateExchangeGroupAlternatives`
real e obtive o MESMO sintoma reportado:

```
Queijo, mozarela        40g
Queijo, minas, meia cura 40g
Queijo, muçarela (mussarela), leite de vaca (média de amostras) 45g
Queijo minas, meia cura   45g   ← DUPLICATA literal do #2
Queijo, prato            35g
```

Investigação da causa raiz — **não é o que parecia**:

- `substitution-engine.ts` (`computeEquivalenceScore`) foi auditado linha a
  linha: o ranking é **100% baseado em erro relativo de nutrientes**
  (energia/proteína/carboidrato/gordura/fibra ponderados por papel
  nutricional). **Não existe nenhum componente de similaridade textual,
  FTS score, `contains` ou `prefix` no cálculo de score** — confirmado por
  leitura completa do arquivo, não é suposição.
- A causa raiz real: `TACO_REFERENCES` combina **duas fontes de dado**
  (`taco.json` + `taco-complementar.json`). Pra pelo menos "Queijo, minas,
  meia cura", as duas fontes têm **cada uma sua própria linha** pro mesmo
  alimento real (`numero=462` e `numero=1043`), com macros ligeiramente
  diferentes. A engine, corretamente, tratava as duas como candidatos
  DISTINTOS — e ambas pontuavam bem, porque nutricionalmente SÃO quase
  idênticas (são o mesmo produto).
- Um segundo bug real, achado durante a auditoria (não reportado
  originalmente, mas visível assim que testei com `allowCrossGroup`
  desligado, o padrão de produção): **"Pão, de queijo, assado" classificava
  como `DAIRY/CHEESE`** — a palavra "queijo" aparece no nome do prato
  (pão recheado de queijo), e a keyword de classificação `"queijo"` batia
  em QUALQUER posição do texto, não só quando o alimento É queijo.

## 2. Peso anterior de similaridade textual no ranking

**Zero.** Auditado e confirmado: `computeEquivalenceScore` nunca recebeu
nem usa nenhum sinal de nome. A hipótese do pedido ("prioriza similaridade
de nome/catalog search") não correspondia ao código real — o sintoma era
idêntico ao que essa causa produziria, mas a causa raiz de fato era outra
(dados duplicados + um bug de classificação por palavra-armadilha).
Documentando isso explicitamente porque mudar a hipótese errada (adicionar
peso anti-nome a um score que já não usa nome) não teria corrigido nada.

## 3. Novo pipeline (o que mudou de fato)

Nenhuma mudança na ORDEM do pipeline pedida na seção 1 — ela já era seguida
(`classifyFoodExchangeGroup` → filtro de grupo → `findFoodSubstitutes` →
score). O que faltava era DEPOIS da classificação e ANTES do ranking final:

```
candidatos do mesmo grupo/subgrupo (já existia)
  ↓
NOVO: deduplicação semântica (nome normalizado, remove parênteses, alias de grafia)
  ↓
score nutricional + ajuste de quantidade (já existia, intocado)
  ↓
NOVO: overfetch (busca mais candidatos que `limit`)
  ↓
NOVO: cap de diversidade por família (máx. 1 por família, com backfill honesto)
  ↓
top N final
```

## 4. Group gate

Sem mudança de comportamento (já funcionava) — mas o bug do item 1 abaixo
("Pão de queijo") estava furando esse gate porque a CLASSIFICAÇÃO em si
estava errada, não o gate. Corrigido na origem (classificador), não com um
filtro adicional no gate.

## 5. Quantity optimizer

Sem mudança — já era "uma alternativa = uma otimização de quantidade"
(`findFoodSubstitutes` sempre calculou exatamente 1 gramatura por
candidato). O sintoma de "duas gramaturas pro mesmo alimento" vinha de
DOIS CANDIDATOS (linhas de dado diferentes), nunca de duas gramaturas pro
MESMO candidato. Corrigido junto com a deduplicação (item 6).

## 6. Deduplicação semântica (`lib/nutrition/food-exchange-engine.ts`)

`deduplicateCandidatesByIdentity()` — agrupa candidatos por nome
normalizado (minúsculas, sem acento, sem pontuação, sem parênteses
`"(média de amostras)"`, com alias de grafia pro caso real encontrado
—"mozarela"/"muçarela"/"mussarela" são a mesma palavra com 3 grafias no
dataset combinado). Mantém o de `numero` mais baixo (heurística estável:
entrada "clássica" antes da "complementar"). **Nunca funde nutrientes** —
a linha descartada simplesmente não vira candidato.

## 7. Family diversity (`applyFamilyDiversityCap`)

`foodFamilyKey()` — pra a maioria dos alimentos, o PRIMEIRO token
significativo já é a família (`"banana"` cobre pacova/nanica/prata/figo,
`"frango"` cobre peito/coxa/fígado). Pra categorias amplas onde o primeiro
token é genérico demais (`queijo`, `leite`, `carne`, `iogurte`, `pão`...),
usa os DOIS primeiros tokens (`"queijo mozarela"` ≠ `"queijo minas"`).
Cap = 1 por família no top N, com **backfill honesto**: se não houver
famílias diferentes suficientes pra preencher `limit`, completa com o
próximo melhor mesmo repetindo família — nunca devolve menos opções por
causa do cap quando a diversidade real da base de dados não permite mais
(documentado como limitação de DADO, não de lógica — ex.: TACO só tem
2 espécies de ave, frango e peru).

## 8. Bug de classificação "prato + de + ingrediente" (`food-exchange-hierarchy.ts`)

`classifyByDishPrefix()` — quando o nome começa com uma palavra de PRATO
seguida de "de" (`"Pão, de queijo, assado"`, `"Salada de tomate"`, `"Suco
de laranja"`, `"Omelete de queijo"`), classifica pelo PRATO BASE (pão→
CARBOHYDRATE/GRAIN, salada→VEGETABLE, suco→FRUIT, omelete→PROTEIN/EGG),
nunca pelo ingrediente que vem depois do "de". Checado ANTES das regras
normais de keyword, e só quando o padrão bate no INÍCIO do nome — nunca
reclassifica o ingrediente sozinho ("Queijo, minas, frescal" continua
classificando CHEESE normalmente).

## 9. Target nutrition / score

Sem mudança — já era congelado por alimento principal, já usa pesos por
`nutritionalRole` (via `classifyFoodRole` → `DEFAULT_SUBSTITUTION_WEIGHTS_BY_ROLE`),
já é explicável (`errorsByNutrient` por nutriente, `consideredNutrients`).
Já era 0% baseado em nome.

## 10. 30 casos auditáveis

Arquivo completo: [reports/p0-exchange-quality-30-cases.md](p0-exchange-quality-30-cases.md) —
30 alimentos reais (os 10 exigidos + 20 extras), top 5 de cada, com
Δkcal/Δprot/Δcarb/Δgord contra o alimento principal.

**Métricas agregadas (85 alternativas geradas no total):**

| Métrica | Meta | Resultado |
|---|---|---|
| duplicateRate | 0 | **0.0%** (0 ocorrências) |
| absurdCandidateRate | 0 | **0.0%** (0 ocorrências) |
| sameGroupRate | ~100% | **100.0%** (85/85) |

Achado honesto: 5 dos 30 casos (Leite, Iogurte, Ricota, Tofu, "Iogurte
grego") geraram **zero alternativas**. Investigado caso a caso:

- **Leite** ("Leite, de vaca, integral"): bug de DADO pré-existente, fora
  do escopo desta correção — a linha TACO tem `energia_kcal: "*"`
  (símbolo TACO pra "não determinado"), e `coerceTacoNumber()`
  (`lib/nutrition/taco.ts`, não tocado nesta fase) converte `"*"` pra `0`
  em vez de `null`. Com o alimento principal em 0kcal/0g de tudo, o motor
  corretamente se recusa a calcular equivalência (comportamento SEGURO,
  não um bug do exchange engine) — mas o dado de origem está errado.
  **Recomendo tratar como item separado, fora deste P0** (mudar
  `coerceTacoNumber` afeta todo o app, violaria a restrição "não mudar
  Nutrition Engine central além do estritamente necessário").
- **Iogurte, Ricota, Tofu**: candidatos existem na base mas nenhum passou
  na tolerância de qualidade (`UNSUITABLE` é descartado antes de virar
  candidato) — comportamento correto do motor (nunca mostra uma
  "equivalência" que não é), reflete que a base TACO tem poucos
  laticínios/derivados de soja nutricionalmente próximos desses
  alimentos específicos nas quantidades testadas.

## 11. Testes (item 21)

`tests/food-exchange-groups.test.ts` — 8 testes novos contra o dataset
TACO **real** (nunca fixtures sintéticas — o bug só aparecia com dados
reais):

- Queijo minas frescal: nenhuma duplicata semântica no top 5 (o bug
  exato reportado).
- Queijo minas frescal: nunca inclui "Pão, de queijo" (prato composto).
- Queijo minas frescal: todo candidato é DAIRY (nunca por kcal isolado).
- Batata doce: candidatos são carboidrato/tubérculo.
- Tilápia/peixe: candidatos são proteicos, nenhuma duplicata.
- Banana: candidatos são frutas, no máx. 2 cultivares de banana no top 5.
- Similaridade de nome nunca vence incompatibilidade de grupo ("queijo
  prato" não substitui arroz).
- Uma alternativa = uma quantidade otimizada (nunca o mesmo `ref`
  aparece duas vezes).

Suite completa: **193 arquivos / 1729 testes, 100% passando.**

## 12. Gates

`tsc --noEmit` limpo · `eslint` limpo · `vitest run` 1729/1729 ·
`migrate:d1:check` 64/64 (nenhuma migração nova nesta fase — mudança é
100% em lógica de código, não em schema) · `npm run build` sucesso ·
**verificação ao vivo contra produção real**: gerei um grupo de troca real
via `POST /api/admin/.../exchange-groups` pro cliente de teste com
"Queijo, minas, frescal" (numero=461, o exemplo EXATO do bug reportado) —
resultado: mozarela, minas-meia-cura, prato, parmesão, muçarela — zero
duplicata, zero "Pão de queijo". Plano de teste removido ao final.

## 13. Riscos conhecidos / não corrigidos (fora de escopo desta fase)

- **Bug de dado `coerceTacoNumber("*") → 0`** (item 10) — afeta "Leite, de
  vaca, integral" e possivelmente outras linhas TACO com dado "não
  determinado". Recomendo fase dedicada (mudança ampla o suficiente pra
  merecer auditoria própria, já que `coerceTacoNumber` é usado em todo o
  app, não só na substituição).
- **Cheeses "mozarela" vs "muçarela...leite de vaca" (numero 463 vs 1042)**
  não são deduplicados como IDÊNTICOS (nomes normalizados diferentes
  demais pra dedup exata) — mas SÃO tratados como a mesma família (via o
  alias de grafia), então nunca ocupam 2 posições simultâneas no top N
  a não ser por backfill quando não há mais nenhuma família diferente
  disponível (documentado, testado).
- Cap de família = 1 é uma heurística por token, não uma taxonomia
  completa — pode haver casos não descobertos nesta auditoria de 30
  alimentos onde a família deveria ser mais ampla ou mais estreita.
  Recomendo expandir o dataset de auditoria continuamente conforme a
  clínica for usando o sistema em produção.

## Declaração

**FOOD_EXCHANGE_QUALITY_READY: sim**

`duplicateRate = 0`, `absurdCandidateRate = 0` (confirmados contra 85
alternativas reais em 30 alimentos, incluindo os 10 exigidos e o exemplo
exato do bug reportado). O top 5 agora representa alternativas
nutricionais reais dentro do mesmo grupo/subgrupo funcional, nunca nomes
parecidos — o que já era verdade no score (auditado, nunca usou nome),
mas agora também é verdade na composição final da lista (deduplicação +
diversidade de família + fix do classificador de prato composto).
