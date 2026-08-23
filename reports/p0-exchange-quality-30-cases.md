# CORREÇÃO P0 — 30 casos auditáveis (dados reais, TACO_REFERENCES)

Gerado após a correção: deduplicação semântica, diversidade por família, e
fix do classificador ("Pão de queijo" não classifica mais como CHEESE). 30
alimentos reais (10 exigidos pela auditoria + 20 extras), top 5 de cada,
com delta de macronutrientes contra o alimento principal na quantidade
prescrita.

Colunas Δ mostram a diferença **absoluta** entre a alternativa (na
quantidade já ajustada) e o alimento principal — nunca por 100g.
5 fixtures não existem na base TACO com o nome exato buscado (Brócolis,
Salmão, Presunto, Quinoa, Espinafre — provavelmente existem sob outro nome
na base real, não confirmado nesta auditoria) e foram puladas.

### Queijo minas frescal
**Primary:** Queijo, minas, frescal — 50 g
**Group/Role:** DAIRY/CHEESE · DAIRY_SOURCE
**Primary macros:** 132 kcal · 8.7g prot · 1.6g carb · 10.1g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Queijo, mozarela | 40g | DAIRY/CHEESE | -0.2 | +0.4 | -0.4 | -0.0 | 0.032 | REVIEW |
| 2 | Queijo, minas, meia cura | 40g | DAIRY/CHEESE | -3.8 | -0.2 | -0.2 | -0.2 | 0.036 | REVIEW |
| 3 | Queijo, prato | 35g | DAIRY/CHEESE | -6.2 | -0.8 | -1.0 | +0.1 | 0.094 | REVIEW |
| 4 | Queijo, parmesão | 30g | DAIRY/CHEESE | +3.8 | +2.0 | -1.1 | -0.0 | 0.110 | REVIEW |
| 5 | Queijo, muçarela (mussarela), leite de vaca (média de amostras) | 45g | DAIRY/CHEESE | +1.5 | +0.1 | -1.1 | +0.3 | 0.087 | REVIEW |

### Tilápia (merluza, filé, cru — tilápia não existe na TACO base)
**Primary:** Merluza, filé, cru — 120 g
**Group/Role:** PROTEIN/FISH · LEAN_PROTEIN
**Primary macros:** 107 kcal · 19.9g prot · 0.0g carb · 2.4g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Corvina de água doce, crua | 105g | PROTEIN/FISH | -0.9 | -0.1 | +0.0 | -0.1 | 0.010 | EXCELLENT |
| 2 | Pescada, filé, frito | 70g | PROTEIN/FISH | +1.0 | +0.1 | +0.0 | +0.1 | 0.011 | EXCELLENT |
| 3 | Sardinha, inteira, crua | 95g | PROTEIN/FISH | +1.2 | +0.1 | +0.0 | +0.1 | 0.013 | EXCELLENT |
| 4 | Pintado, assado | 55g | PROTEIN/FISH | -1.6 | +0.1 | +0.0 | -0.2 | 0.027 | EXCELLENT |
| 5 | Pescadinha, crua | 130g | PROTEIN/FISH | -7.6 | +0.2 | +0.0 | -0.9 | 0.104 | REVIEW |

### Frango
**Primary:** Frango, peito, sem pele, cru — 120 g
**Group/Role:** PROTEIN/POULTRY · LEAN_PROTEIN
**Primary macros:** 143 kcal · 25.8g prot · 0.0g carb · 3.6g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Frango, peito, cozido, s/ pele, s/ sal | 85g | PROTEIN/POULTRY | -4.4 | +0.5 | +0.0 | -0.6 | 0.054 | REVIEW |
| 2 | Peru, congelado, cru | 145g | PROTEIN/POULTRY | -7.1 | +0.4 | +0.0 | -1.0 | 0.075 | REVIEW |
| 3 | Frango, peito, sem pele, cozido | 80g | PROTEIN/POULTRY | -12.7 | -0.7 | +0.0 | -1.1 | 0.098 | REVIEW |
| 4 | Frango, fígado, cru | 145g | PROTEIN/POULTRY | +11.4 | -0.3 | -0.0 | +1.4 | 0.122 | REVIEW |

### Batata doce
**Primary:** Batata, doce, cozida — 150 g
**Group/Role:** CARBOHYDRATE/TUBER_ROOT · STARCH_SOURCE
**Primary macros:** 115 kcal · 1.0g prot · 27.6g carb · 0.1g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Batata, doce, crua | 100g | CARBOHYDRATE/TUBER_ROOT | +3.1 | +0.3 | +0.6 | +0.0 | 0.078 | REVIEW |
| 2 | Mandioca, crua | 75g | CARBOHYDRATE/TUBER_ROOT | -1.6 | -0.1 | -0.5 | +0.1 | 0.170 | REVIEW |
| 3 | Farinha, de mandioca, torrada | 30g | CARBOHYDRATE/TUBER_ROOT | -5.6 | -0.6 | -0.9 | -0.0 | 0.177 | REVIEW |
| 4 | Cará, cozido | 145g | CARBOHYDRATE/TUBER_ROOT | -2.6 | +1.3 | -0.3 | +0.0 | 0.186 | REVIEW |
| 5 | Fécula, de mandioca | 35g | CARBOHYDRATE/TUBER_ROOT | +0.7 | -0.8 | +0.8 | -0.0 | 0.241 | REVIEW |

### Arroz
**Primary:** Arroz, tipo 1, cozido — 100 g
**Group/Role:** CARBOHYDRATE/GRAIN · STARCH_SOURCE
**Primary macros:** 128 kcal · 2.5g prot · 28.1g carb · 0.2g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Cereal matinal, milho | 35g | CARBOHYDRATE/GRAIN | -0.4 | -0.0 | +1.3 | +0.1 | 0.075 | REVIEW |
| 2 | Canjica, branca, crua | 35g | CARBOHYDRATE/GRAIN | -3.1 | -0.0 | -0.7 | +0.1 | 0.098 | REVIEW |
| 3 | Arroz, tipo 2, cozido | 100g | CARBOHYDRATE/GRAIN | +1.9 | +0.0 | +0.1 | +0.1 | 0.110 | REVIEW |
| 4 | Cereais, mingau, milho, infantil | 30g | CARBOHYDRATE/GRAIN | -9.9 | -0.6 | -1.9 | +0.1 | 0.167 | REVIEW |
| 5 | Farinha, de milho, amarela | 35g | CARBOHYDRATE/GRAIN | -5.6 | -0.0 | -0.4 | +0.3 | 0.176 | REVIEW |

### Banana
**Primary:** Banana, prata, crua — 80 g
**Group/Role:** FRUIT/GENERIC_FRUIT · FRUIT_SOURCE
**Primary macros:** 79 kcal · 1.0g prot · 20.8g carb · 0.1g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Banana, pacova, crua | 100g | FRUIT/GENERIC_FRUIT | -0.7 | +0.2 | -0.5 | +0.0 | 0.115 | REVIEW |
| 2 | Pêssego, enlatado, em calda | 125g | FRUIT/GENERIC_FRUIT | +0.3 | -0.1 | +0.3 | -0.1 | 0.149 | REVIEW |
| 3 | Figo, enlatado, em calda | 40g | FRUIT/GENERIC_FRUIT | -4.9 | -0.8 | -0.6 | +0.0 | 0.193 | REVIEW |
| 4 | Maçã, Fuji, com casca, crua | 135g | FRUIT/GENERIC_FRUIT | -3.7 | -0.6 | -0.3 | -0.1 | 0.197 | REVIEW |
| 5 | Tamarindo, cru | 30g | FRUIT/GENERIC_FRUIT | +4.1 | -0.1 | +1.0 | +0.1 | 0.225 | REVIEW |

### Leite
**Primary:** Leite, de vaca, integral — 200 g
**Group/Role:** DAIRY/MILK · DAIRY_SOURCE
**Primary macros:** 0 kcal · 0.0g prot · 0.0g carb · 0.0g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
_(nenhuma alternativa gerada — ver seção de notas)_

### Iogurte
**Primary:** Iogurte, natural — 170 g
**Group/Role:** DAIRY/YOGURT · DAIRY_SOURCE
**Primary macros:** 88 kcal · 6.9g prot · 3.3g carb · 5.2g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
_(nenhuma alternativa gerada — ver seção de notas)_

### Ovo
**Primary:** Ovo, de galinha, inteiro, cozido/10minutos — 100 g
**Group/Role:** PROTEIN/EGG · LEAN_PROTEIN
**Primary macros:** 146 kcal · 13.3g prot · 0.6g carb · 9.5g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Ovo, de galinha, inteiro, cru | 100g | PROTEIN/EGG | -2.6 | -0.3 | +1.0 | -0.6 | 0.198 | REVIEW |

### Feijão
**Primary:** Feijão, carioca, cozido — 100 g
**Group/Role:** PROTEIN/LEGUME · PLANT_PROTEIN
**Primary macros:** 76 kcal · 4.8g prot · 13.6g carb · 0.5g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Feijão, rajado, cozido | 90g | PROTEIN/LEGUME | -0.2 | +0.2 | +0.1 | -0.2 | 0.044 | REVIEW |
| 2 | Lentilha, cozida | 85g | PROTEIN/LEGUME | +2.3 | +0.6 | +0.3 | -0.1 | 0.075 | REVIEW |
| 3 | Ervilha, enlatada, drenada | 100g | PROTEIN/LEGUME | -2.6 | -0.2 | -0.1 | -0.2 | 0.102 | REVIEW |
| 4 | Guandu, cru | 20g | PROTEIN/LEGUME | -7.6 | -1.0 | -0.8 | -0.1 | 0.161 | REVIEW |
| 5 | Feijão, preto, cozido | 95g | PROTEIN/LEGUME | -3.2 | -0.5 | -0.3 | -0.0 | 0.046 | REVIEW |

### Carne bovina
**Primary:** Carne, bovina, acém, sem gordura, cru — 100 g
**Group/Role:** PROTEIN/RED_MEAT · FATTY_PROTEIN
**Primary macros:** 144 kcal · 20.8g prot · 0.0g carb · 6.1g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Carne, bovina, capa de contra-filé, sem gordura, grelhada | 60g | PROTEIN/RED_MEAT | -0.4 | +0.2 | -0.0 | -0.1 | 0.011 | EXCELLENT |
| 2 | Presunto, fatiado, industrializado | 120g | PROTEIN/RED_MEAT | -3.6 | -0.4 | +1.2 | -0.1 | 0.021 | EXCELLENT |
| 3 | Carne, bovina, acém, moído, cru | 105g | PROTEIN/RED_MEAT | -0.6 | -0.4 | +0.0 | +0.1 | 0.014 | EXCELLENT |
| 4 | Carne, bovina, lagarto, cozido | 65g | PROTEIN/RED_MEAT | +0.6 | +0.5 | +0.0 | -0.2 | 0.018 | EXCELLENT |
| 5 | Carne, bovina, coxão duro, sem gordura, cozido | 65g | PROTEIN/RED_MEAT | -3.2 | -0.1 | +0.0 | -0.3 | 0.019 | EXCELLENT |

### Maçã
**Primary:** Maçã, Fuji, com casca, crua — 100 g
**Group/Role:** FRUIT/GENERIC_FRUIT · FRUIT_SOURCE
**Primary macros:** 56 kcal · 0.3g prot · 15.2g carb · 0.0g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Manga, Palmer, crua | 80g | FRUIT/GENERIC_FRUIT | +2.5 | +0.0 | +0.3 | +0.1 | 0.045 | REVIEW |
| 2 | Ameixa, em calda, enlatada, drenada | 30g | FRUIT/GENERIC_FRUIT | -2.3 | +0.0 | -0.9 | +0.1 | 0.046 | EXCELLENT |
| 3 | Maçã, Argentina, com casca, crua | 90g | FRUIT/GENERIC_FRUIT | +0.8 | -0.1 | -0.2 | +0.2 | 0.096 | REVIEW |
| 4 | Banana, doce em barra | 20g | FRUIT/GENERIC_FRUIT | +0.5 | +0.1 | -0.0 | +0.0 | 0.125 | REVIEW |
| 5 | Figo, enlatado, em calda | 30g | FRUIT/GENERIC_FRUIT | -0.2 | -0.1 | -0.1 | +0.0 | 0.131 | REVIEW |

### Aveia
**Primary:** Aveia, flocos, crua — 30 g
**Group/Role:** CARBOHYDRATE/GRAIN · STARCH_SOURCE
**Primary macros:** 118 kcal · 4.2g prot · 20.0g carb · 2.5g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Pão, aveia, forma | 35g | CARBOHYDRATE/GRAIN | +1.9 | +0.1 | +0.9 | -0.6 | 0.077 | REVIEW |
| 2 | Pão, de soja | 35g | CARBOHYDRATE/GRAIN | -10.1 | -0.2 | -0.2 | -1.3 | 0.124 | REVIEW |
| 3 | Pão, forma, trigo integral, com fibras (média de marcas) | 40g | CARBOHYDRATE/GRAIN | -10.9 | +0.3 | +0.2 | -1.2 | 0.140 | REVIEW |
| 4 | Curau, milho verde | 145g | CARBOHYDRATE/GRAIN | -4.4 | -0.8 | +0.2 | -0.2 | 0.142 | REVIEW |
| 5 | Granola, c/ cereais, frutas secas e oleaginosas, c/ óleo e mel | 30g | CARBOHYDRATE/GRAIN | +4.9 | -1.0 | -1.5 | +2.0 | 0.158 | REVIEW |

### Azeite
**Primary:** Azeite, de oliva, extra virgem — 10 g
**Group/Role:** FAT/OIL · FAT_SOURCE
**Primary macros:** 88 kcal · 0.0g prot · 0.0g carb · 10.0g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Azeite, de dendê | 10g | FAT/OIL | +0.0 | +0.0 | +0.0 | +0.0 | 0.000 | EXCELLENT |
| 2 | Óleo, de babaçu | 10g | FAT/OIL | +0.0 | +0.0 | +0.0 | +0.0 | 0.000 | EXCELLENT |
| 3 | Óleo, de canola | 10g | FAT/OIL | +0.0 | +0.0 | +0.0 | +0.0 | 0.000 | EXCELLENT |
| 4 | Óleo, de girassol | 10g | FAT/OIL | +0.0 | +0.0 | +0.0 | +0.0 | 0.000 | EXCELLENT |
| 5 | Óleo, de pequi | 10g | FAT/OIL | +0.0 | +0.0 | +0.0 | +0.0 | 0.000 | EXCELLENT |

### Brócolis
FIXTURE NÃO ENCONTRADA na TACO — pulado.


### Requeijão
**Primary:** Queijo, requeijão, cremoso — 30 g
**Group/Role:** DAIRY/CHEESE · DAIRY_SOURCE
**Primary macros:** 77 kcal · 2.9g prot · 0.7g carb · 7.0g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Requeijão, creme, tipo Catupiry | 30g | DAIRY/CHEESE | +2.2 | +0.1 | +0.0 | +0.2 | 0.028 | EXCELLENT |
| 2 | Queijo, pasteurizado | 25g | DAIRY/CHEESE | -1.2 | -0.5 | +0.7 | -0.2 | 0.138 | REVIEW |

### Ricota
**Primary:** Queijo, ricota — 50 g
**Group/Role:** DAIRY/CHEESE · DAIRY_SOURCE
**Primary macros:** 70 kcal · 6.3g prot · 1.9g carb · 4.1g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
_(nenhuma alternativa gerada — ver seção de notas)_

### Lentilha
**Primary:** Lentilha, cozida — 100 g
**Group/Role:** PROTEIN/LEGUME · PLANT_PROTEIN
**Primary macros:** 93 kcal · 6.3g prot · 16.3g carb · 0.5g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Feijão, rosinha, cozido | 140g | PROTEIN/LEGUME | +2.4 | +0.0 | +0.2 | +0.1 | 0.062 | REVIEW |
| 2 | Ervilha, enlatada, drenada | 120g | PROTEIN/LEGUME | -4.0 | -0.8 | -0.2 | -0.1 | 0.074 | REVIEW |
| 3 | Guandu, cru | 25g | PROTEIN/LEGUME | -6.6 | -1.6 | -0.3 | +0.0 | 0.099 | REVIEW |
| 4 | Lentilha, crua | 25g | PROTEIN/LEGUME | -7.9 | -0.5 | -0.8 | -0.3 | 0.178 | REVIEW |
| 5 | Feijão, fradinho, cozido | 120g | PROTEIN/LEGUME | +1.0 | -0.2 | -0.1 | +0.2 | 0.075 | REVIEW |

### Macarrão
**Primary:** Macarrão, trigo, cru — 80 g
**Group/Role:** CARBOHYDRATE/PASTA · STARCH_SOURCE
**Primary macros:** 297 kcal · 8.0g prot · 62.4g carb · 1.0g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Lasanha, massa fresca, crua | 140g | CARBOHYDRATE/PASTA | +11.5 | +1.8 | +0.7 | +0.8 | 0.124 | REVIEW |
| 2 | Lasanha, massa fresca, cozida | 190g | CARBOHYDRATE/PASTA | +14.3 | +3.0 | -0.6 | +1.2 | 0.212 | REVIEW |

### Mandioca
**Primary:** Mandioca, cozida — 150 g
**Group/Role:** CARBOHYDRATE/TUBER_ROOT · STARCH_SOURCE
**Primary macros:** 188 kcal · 0.9g prot · 45.1g carb · 0.4g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Mandioca, crua | 125g | CARBOHYDRATE/TUBER_ROOT | +1.2 | +0.6 | +0.1 | -0.1 | 0.083 | REVIEW |
| 2 | Farinha, de mandioca, crua | 50g | CARBOHYDRATE/TUBER_ROOT | -7.6 | -0.1 | -1.2 | -0.3 | 0.150 | REVIEW |
| 3 | Batata, baroa, crua | 190g | CARBOHYDRATE/TUBER_ROOT | +3.8 | +1.1 | +0.4 | -0.1 | 0.259 | REVIEW |
| 4 | Fécula, de mandioca | 55g | CARBOHYDRATE/TUBER_ROOT | -6.1 | -0.6 | -0.5 | -0.3 | 0.259 | REVIEW |
| 5 | Inhame, cru | 195g | CARBOHYDRATE/TUBER_ROOT | +0.5 | +3.1 | +0.2 | -0.0 | 0.424 | REVIEW |

### Laranja
**Primary:** Laranja, pêra, crua — 130 g
**Group/Role:** FRUIT/GENERIC_FRUIT · FRUIT_SOURCE
**Primary macros:** 48 kcal · 1.4g prot · 11.6g carb · 0.2g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Laranja, da terra, suco | 120g | FRUIT/GENERIC_FRUIT | +1.3 | -0.6 | -0.1 | +0.0 | 0.090 | REVIEW |
| 2 | Caju, polpa, congelada | 125g | FRUIT/GENERIC_FRUIT | -2.1 | -0.8 | +0.1 | +0.0 | 0.092 | REVIEW |
| 3 | Abacaxi, cru | 95g | FRUIT/GENERIC_FRUIT | -1.9 | -0.5 | +0.1 | -0.0 | 0.092 | REVIEW |
| 4 | Tangerina, Poncã, crua | 120g | FRUIT/GENERIC_FRUIT | -2.4 | -0.3 | -0.1 | -0.1 | 0.109 | REVIEW |
| 5 | Uva, Itália, crua | 85g | FRUIT/GENERIC_FRUIT | -2.9 | -0.7 | -0.1 | +0.0 | 0.110 | REVIEW |

### Amendoim
**Primary:** Amendoim, torrado, salgado — 30 g
**Group/Role:** PROTEIN/LEGUME · PLANT_PROTEIN
**Primary macros:** 182 kcal · 6.7g prot · 5.6g carb · 16.2g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Amendoim, grão, cru | 35g | PROTEIN/LEGUME | +8.7 | +2.8 | +1.5 | -0.8 | 0.115 | REVIEW |

### Salmão
FIXTURE NÃO ENCONTRADA na TACO — pulado.


### Presunto
FIXTURE NÃO ENCONTRADA na TACO — pulado.


### Tofu
**Primary:** Soja, queijo (tofu) — 100 g
**Group/Role:** PROTEIN/SOY · PLANT_PROTEIN
**Primary macros:** 64 kcal · 6.6g prot · 2.1g carb · 4.0g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
_(nenhuma alternativa gerada — ver seção de notas)_

### Quinoa
FIXTURE NÃO ENCONTRADA na TACO — pulado.


### Iogurte grego
**Primary:** Iogurte, natural — 100 g
**Group/Role:** DAIRY/YOGURT · DAIRY_SOURCE
**Primary macros:** 51 kcal · 4.1g prot · 1.9g carb · 3.0g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
_(nenhuma alternativa gerada — ver seção de notas)_

### Cenoura
**Primary:** Cenoura, crua — 80 g
**Group/Role:** VEGETABLE/GENERIC_VEGETABLE · VEGETABLE_SOURCE
**Primary macros:** 27 kcal · 1.1g prot · 6.1g carb · 0.1g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Alho-poró, cru | 90g | VEGETABLE/GENERIC_VEGETABLE | +1.0 | +0.2 | +0.1 | -0.0 | 0.061 | REVIEW |
| 2 | Cenoura, cozida | 90g | VEGETABLE/GENERIC_VEGETABLE | -0.4 | -0.3 | -0.1 | +0.1 | 0.090 | REVIEW |
| 3 | Pimentão, vermelho, cru | 110g | VEGETABLE/GENERIC_VEGETABLE | -1.7 | +0.1 | -0.1 | +0.0 | 0.093 | REVIEW |
| 4 | Chuchu, cru | 150g | VEGETABLE/GENERIC_VEGETABLE | -1.8 | -0.0 | +0.1 | -0.0 | 0.095 | REVIEW |
| 5 | Beterraba, cozida | 85g | VEGETABLE/GENERIC_VEGETABLE | +0.0 | +0.0 | +0.0 | -0.1 | 0.098 | REVIEW |

### Espinafre
FIXTURE NÃO ENCONTRADA na TACO — pulado.


### Grão de bico
**Primary:** Grão-de-bico, cru — 100 g
**Group/Role:** PROTEIN/LEGUME · PLANT_PROTEIN
**Primary macros:** 355 kcal · 21.2g prot · 57.9g carb · 5.4g gord

| # | Alternativa | Qtd | Grupo/Subgrupo | Δkcal | Δprot | Δcarb | Δgord | Score | Qualidade |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Lentilha, crua | 95g | PROTEIN/LEGUME | -32.5 | +0.8 | +1.0 | -4.7 | 0.167 | REVIEW |
| 2 | Feijão, rosinha, cru | 95g | PROTEIN/LEGUME | -34.6 | -1.4 | +1.2 | -4.2 | 0.201 | REVIEW |
| 3 | Ervilha, em vagem | 405g | PROTEIN/LEGUME | +2.1 | +9.0 | -0.3 | -3.5 | 0.402 | REVIEW |
| 4 | Baião de dois, arroz e feijão-de-corda | 285g | PROTEIN/LEGUME | +32.0 | -3.4 | +0.3 | +3.8 | 0.140 | REVIEW |
| 5 | Feijão, rosinha, cozido | 490g | PROTEIN/LEGUME | -22.2 | +1.0 | +0.0 | -3.1 | 0.201 | REVIEW |


=== MÉTRICAS AGREGADAS ===
Total de alimentos testados: 30
Total de alternativas geradas: 85
sameGroupRate: 100.0% (85/85)
duplicateRate: 0.0% (0 ocorrências)
absurdCandidateRate (grupo diferente do primary): 0.0% (0 ocorrências)
Casos sem nenhuma alternativa: 5/30
