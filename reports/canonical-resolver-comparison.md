# Comparação: resolver ativo (TACO+COMPLEMENTARY local) vs resolver canônico (TBCA+TACO+POF reais)

Gerado em: 2026-08-22T13:02:14.931Z

Total de queries: 24

## Resumo

- CONSISTENT (mesmo alimento provável): 6
- CANONICAL_FOUND_MORE (canônico achou, atual não): 9
- CANONICAL_FOUND_LESS (atual achou, canônico não): 0
- DIFFERENT_TOP_MATCH (os dois acharam algo, mas alimentos diferentes): 9

## Detalhe por query

| query | atual (status/top/fonte) | canônico (status/top/fonte/score) | prep | resultado |
|---|---|---|---|---|
| arroz integral cozido | NEEDS_REVIEW / Arroz, integral, cozido / TACO | EXACT / Arroz, integral, cozido / TACO / 135.0 | COOKED | **CONSISTENT** |
| arroz branco | NEEDS_REVIEW / Arroz, tipo 1, cozido / TACO | AMBIGUOUS / Papa de carne bovina moída (acém), arroz branco e brócolis, c/ caldo de carne, c/ cebola, s/ óleo, c/ sal / TBCA / 48.0 | — | **DIFFERENT_TOP_MATCH** |
| feijão preto cozido | NEEDS_REVIEW / Feijão, preto, cozido / TACO | EXACT / Feijão, preto, cozido / TACO / 135.0 | COOKED | **CONSISTENT** |
| ovo cozido | NEEDS_REVIEW / Ovo, de galinha, inteiro, cozido/10minutos / TACO | AMBIGUOUS / Ovo, codorna, inteiro, cozido, c/ sal / TBCA / 71.8 | COOKED | **DIFFERENT_TOP_MATCH** |
| ovo mexido | NOT_FOUND / — / — | PREPARATION_REVIEW / Ovo, galinha, clara, desidratada, pasteurizada, Brasil / TBCA / 27.3 | SCRAMBLED | **CANONICAL_FOUND_MORE** |
| frango grelhado | NEEDS_REVIEW / Frango, coração, grelhado / TACO | RESOLVED / Frango, coração, grelhado / TACO / 68.9 | GRILLED | **CONSISTENT** |
| peito de frango | NEEDS_REVIEW / Frango, peito, com pele, assado / TACO | AMBIGUOUS / Peito de frango, grelhado, c/ óleo, c/ sal, Brasil (peito de frango, óleo de soja, água, páprica doce, alho, c/ sal) (peito de frango, óleo de soja, água, páprica doce, alho, c/ sal) / TBCA / 68.5 | — | **DIFFERENT_TOP_MATCH** |
| tilápia assada | NOT_FOUND / — / — | PREPARATION_REVIEW / Peixe, água doce, tilápia, filé, cru, Brasil / TBCA / 20.0 | ROASTED | **CANONICAL_FOUND_MORE** |
| banana | NEEDS_REVIEW / Banana, da terra, crua / TACO | AMBIGUOUS / Banana, passa, Brasil / TBCA / 87.6 | — | **DIFFERENT_TOP_MATCH** |
| banana prata | NEEDS_REVIEW / Banana, prata, crua / TACO | AMBIGUOUS / Banana, prata, in natura , Brasil / TBCA / 88.0 | — | **DIFFERENT_TOP_MATCH** |
| mamão | NEEDS_REVIEW / Mamão, doce em calda, drenado / TACO | EXACT / Mamão / IBGE_POF / 109.8 | — | **CONSISTENT** |
| abacate | NEEDS_REVIEW / Abacate, cru / TACO | EXACT / Abacate / IBGE_POF / 111.0 | — | **CONSISTENT** |
| leite integral | NEEDS_REVIEW / Canjica, com leite integral / TACO | EXACT / Leite, de vaca, integral / TACO / 100.0 | — | **DIFFERENT_TOP_MATCH** |
| leite desnatado | NEEDS_REVIEW / Leite, de vaca, desnatado, pó / TACO | EXACT / Leite de vaca desnatado / IBGE_POF / 96.0 | — | **DIFFERENT_TOP_MATCH** |
| milho cru | NEEDS_REVIEW / Milho, amido, cru / TACO | AMBIGUOUS / Milho, fubá, cru / TACO / 71.0 | RAW | **DIFFERENT_TOP_MATCH** |
| milho cozido | NEEDS_REVIEW / Cuscuz, de milho, cozido com sal / TACO | EXACT / Milho cozido / IBGE_POF / 121.9 | COOKED | **DIFFERENT_TOP_MATCH** |
| milho grelhado | NOT_FOUND / — / — | PREPARATION_REVIEW / Bolo, pronto, milho / TACO / 28.1 | GRILLED | **CANONICAL_FOUND_MORE** |
| milho assado | NOT_FOUND / — / — | RESOLVED / Milho (em grão) / IBGE_POF / 47.9 | ROASTED | **CANONICAL_FOUND_MORE** |
| abacaxi perola | NOT_FOUND / — / — | RESOLVED / Abacaxi, Pérola, Ananas comosus L. / TBCA / 79.5 | — | **CANONICAL_FOUND_MORE** |
| achocolatado em po dietetico | NOT_FOUND / — / — | RESOLVED / Achocolatado, em pó, dietético, Marca comercial, Brasil / TBCA / 83.5 | — | **CANONICAL_FOUND_MORE** |
| azeite de dende | NEEDS_REVIEW / Azeite, de dendê / TACO | EXACT / Azeite, de dendê / TACO / 115.0 | — | **CONSISTENT** |
| peixe agua doce tilapia file cru | NOT_FOUND / — / — | RESOLVED / Peixe, água doce, tilápia, filé, cru, Brasil / TBCA / 111.0 | RAW | **CANONICAL_FOUND_MORE** |
| arroz de coco | NOT_FOUND / — / — | AMBIGUOUS / Arroz de coco, c/ arroz integral, c/ sal (arroz integral cozido, c/ coco e leite de coco, c/ óleo, cebola e alho, c/ sal) / TBCA / 70.0 | — | **CANONICAL_FOUND_MORE** |
| yakissoba | NOT_FOUND / — / — | AMBIGUOUS / Yakissoba / IBGE_POF / 112.0 | — | **CANONICAL_FOUND_MORE** |