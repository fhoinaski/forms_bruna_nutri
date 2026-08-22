# Confidence Policy — Error Analysis (Fase 5.5, item 11)

Gerado em: 2026-08-22. Todos os falsos positivos da policy V2
(`canAutoResolveCanonicalV2`) sobre o dataset de calibração real
(`reports/fase55-calibration-dataset.json`, 338 linhas: 130 ground truth
reais + 23 DIFFERENT_TOP auditados + 60 CANONICAL_FOUND_MORE auditados +
125 amostra fresca).

## Caso 1 — "Pão de queijo, mistura p/" (ground truth real)

| Campo | Valor |
|---|---|
| Query | `Pão de queijo, mistura p/` |
| Resultado escolhido | `Pão de queijo, mistura p/ (média de diferentes marcas), Brasil` (`tbca:medidas_caseiras:BRC0044R`) |
| Resultado esperado (ground truth real) | `Pão de queijo, mistura p/, Brasil` (`tbca:medidas_caseiras:BRC0081R`) |
| matchClass | EXACT_NAME |
| score / gap | 112 / 27 |
| queryRisk (antes da correção) | LOW_RISK |
| classificationGroup | R - Alimentos industrializados |
| presenceOfBrandSignal | **true** |

**Por que a policy V2 (antes da correção) aceitou:** `EXACT_NAME` com
score 112 e gap 27 folgam muito acima do limite (95/8) — nada no gap ou
no score sinalizava risco. O sinal `presenceOfBrandSignal` já detectava
corretamente que é um produto industrializado com nome ambíguo, mas a
regra original só contava esse sinal como risco quando
`queryTokenCount <= 2` — aqui a query tinha 4 tokens, então o sinal foi
ignorado.

**Por que a policy falhou:** as duas entradas TBCA são REAIS e
DIFERENTES (`BRC0044R` = média de várias marcas; `BRC0081R` = uma marca/
mistura específica) — nomes quase idênticos (o núcleo, antes do
parêntese, é literalmente igual: `"Pão de queijo, mistura p/"`), mas
identidades nutricionais distintas. Isso não é um problema de score/gap —
é uma ambiguidade de CONTEÚDO que só um sinal de "produto/marca" pode
capturar, nunca o ranking textual sozinho.

**Correção aplicada:** `presenceOfBrandSignal` agora é sempre um sinal de
risco ALTO (bloqueia auto-aceitação), independente da contagem de tokens
da query — ver `lib/nutrition/canonical-confidence-features.ts`. Após a
correção, este caso deixa de ser aceito automaticamente (vira PARTIAL/
precisa de revisão humana, nunca INCORRECT silencioso).

**Nota:** V1 (`canUseCanonical`, a policy atual em produção-shadow) tem
exatamente o mesmo falso positivo neste caso, e não tem nenhum mecanismo
de sinal de marca/produto — permanece vulnerável a esse padrão de erro,
o que é justamente o motivo desta fase (item 1: "quero descobrir quais
sinais realmente predizem uma resolução correta", não só ajustar
threshold).

## Métricas finais (após a correção — ver reports/fase55-policy-comparison.json)

Ver o relatório final (`reports/fase55-confidence-calibration-final.md`)
para a tabela precision/coverage V1 vs V2 completa.
