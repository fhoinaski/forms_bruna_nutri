# Qualidade do ranking canônico — antes/depois (Fase 3.5)

Gerado em: 2026-08-22T13:01:28.795Z
Total de casos (ground truth real, auto-referencial): 130

## Por categoria

- cereais: 8
- feijoes: 8
- carnes: 8
- ovos: 8
- pescados: 8
- frutas: 8
- verduras: 8
- laticinios: 8
- industrializados: 14
- preparacoes: 6
- regionais: 8
- cultivares: 8
- taco_geral: 15
- pof_geral: 15

## Alimento simples vs prato composto (queries genéricas reais do shadow report)

| query | top1 antes | top1 depois |
|---|---|---|
| banana | Banana, doce em barra | Banana, passa, Brasil |
| arroz branco | Papa de carne bovina moída (acém), arroz branco e brócolis, c/ caldo de carne, c/ cebola, s/ óleo, c/ sal | Papa de carne bovina moída (acém), arroz branco e brócolis, c/ caldo de carne, c/ cebola, s/ óleo, c/ sal |
| leite integral | Leite, de vaca, integral | Leite, de vaca, integral |
| leite desnatado | Leite de vaca desnatado | Leite de vaca desnatado |
| banana flambada | Banana flambada (sorvete, banana, suco de laranja, conhaque) | Banana flambada (sorvete, banana, suco de laranja, conhaque) |
| arroz de coco | Arroz de coco, c/ arroz integral, c/ sal (arroz integral cozido, c/ coco e leite de coco, c/ óleo, cebola e alho, c/ sal) | Arroz de coco, c/ arroz integral, c/ sal (arroz integral cozido, c/ coco e leite de coco, c/ óleo, cebola e alho, c/ sal) |

## Métricas

| métrica | antes | depois |
|---|---:|---:|
| top1_correct | 90.77% | 90% |
| top3_contains_expected | 95.38% | 95.38% |
| ambiguous_rate | 13.85% | 13.85% |
| not_found_rate | 0% | 0% |
| preparation_review_rate | 0% | 0% |

## Regressões (top1 correto antes, errado depois): 1

- "Bebida láctea" esperado "Bebida láctea (média de diferentes sabores), Brasil" → agora "Bebida láctea"

## Melhorias (top1 errado antes, correto depois): 0
