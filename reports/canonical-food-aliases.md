# Aliases curados — Canonical Food Search (Fase 3.5)

Gerado em: 2026-08-22T13:01:08.351Z
Total: 4 regras, 4 inseridas, 0 já existentes (idempotente).

| alias | canonical_food_id | destino | confidence | motivo |
|---|---|---|---|---|
| arroz branco cru | `taco:4` | Arroz, tipo 1, cru | MANUAL_CURATED | "Arroz branco" é o nome popular do que a TACO chama "Arroz, tipo 1" (arroz polido comum, sem casca) — termo comprovável no próprio domínio (TACO não usa "branco" na nomenclatura técnica, mas é como a população brasileira se refere a esse produto). Sem alias, "arroz branco" só batia por CONTAINS em pratos compostos que citam "arroz branco" como ingrediente, nunca no alimento simples. |
| arroz branco cozido | `taco:3` | Arroz, tipo 1, cozido | MANUAL_CURATED | Mesmo raciocínio de 'arroz branco cru', na variante cozida — preparo preservado explicitamente na query, nunca removido. |
| leite integral | `taco:458` | Leite, de vaca, integral | MANUAL_CURATED | A TACO nomeia como "Leite, de vaca, integral" — a query natural "leite integral" omite "de vaca" (espécie), que em português corrente é o padrão implícito quando não se especifica outro animal (a própria base tem "Leite, búfala, integral" e "Leite, cabra, integral" como entradas SEPARADAS e explicitamente rotuladas). "integral" (o atributo de gordura) é preservado — nunca removido. Sem alias, a ordem "leite, de vaca, integral" nunca virava PREFIX/EXACT contra "leite integral" (a palavra "vaca" no meio quebra o prefixo). |
| leite desnatado | `ibge_pof:7903601:99` | Leite de vaca desnatado | MANUAL_CURATED | Mesmo raciocínio de 'leite integral' — POF já nomeia exatamente 'Leite de vaca desnatado' sem qualificador de forma (pó/UHT), o candidato mais limpo pra a busca genérica. 'desnatado' preservado — nunca removido. |

## Categorias rejeitadas nesta rodada (documentado, não implementado)

- **EXACT_NORMALIZATION em massa (diferenças só de pontuação)**: redundante — `normalizeFoodName` já resolve isso em tempo de busca (a mesma normalização usada para gravar `normalized_name` na importação). Criar uma linha de alias pra cada nome com vírgula (milhares de alimentos TACO/TBCA) não adicionaria cobertura nenhuma, só inflaria a tabela.
- **SAFE_VARIANT em massa (acento/sem acento)**: mesmo motivo — `normalizeFoodName` já remove acento na comparação em tempo real, então uma variante 'sem acento' de um nome já bate igual, sem precisar de alias.
- **Cultivares em massa**: auditado o ground truth de 130 casos (`reports/canonical-search-quality.md`) — não apareceu nenhum caso real onde um cultivar citado numa query não batesse via o ranking normal (prefix/contains já cobre 'banana prata', 'abacaxi pérola' etc.). Não fabricado alias sem gap real comprovado.