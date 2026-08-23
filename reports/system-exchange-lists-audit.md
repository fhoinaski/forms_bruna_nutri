# System Exchange Lists Audit

Data: 2026-08-22

## Escopo

Auditoria das listas `SYSTEM` criadas em `db/20260822_0066_curated_exchange_lists.sql`.

As listas sao base inicial de biblioteca profissional. Elas nao pretendem substituir curadoria da nutricionista nem cobrir todos os alimentos do banco.

## Listas criadas

### MAIN_MEAL_STARCHES

- Nome: Carboidratos - refeicao principal
- Contexto: almoco e jantar
- Papel nutricional: `STARCH_SOURCE`
- Papel culinario: `STARCH_MAIN`
- Perfil padrao: `CARBOHYDRATE`
- Itens TACO: arroz branco cozido, arroz integral cozido, batata-doce cozida, batata inglesa cozida, mandioca cozida, cuscuz de milho cozido.
- Racional: amidos de prato principal, evitando busca global por qualquer carboidrato.

### BREAKFAST_CARBS

- Nome: Carboidratos - cafe/lanche
- Contexto: cafe da manha, lanches e ceia
- Papel nutricional: `STARCH_SOURCE`
- Papel culinario: `BREAKFAST_CARB`
- Perfil padrao: `BALANCED`
- Itens TACO: pao integral, pao frances, tapioca, cuscuz, aveia, torrada.
- Racional: bases praticas de cafe/lanche, separadas dos amidos de almoco/jantar.

### LEAN_MAIN_PROTEINS

- Nome: Proteinas magras - refeicao principal
- Contexto: almoco e jantar
- Papel nutricional: `LEAN_PROTEIN`
- Papel culinario: `LEAN_PROTEIN_MAIN`
- Perfil padrao: `PROTEIN`
- Itens TACO: peito de frango grelhado, peixe, carne bovina magra grelhada.
- Racional: proteinas principais de refeicoes completas, sem depender de ranking global.

### FRUIT_PORTIONS

- Nome: Frutas
- Contexto: cafe da manha, lanches e ceia
- Papel nutricional: `FRUIT_SOURCE`
- Papel culinario: `FRUIT_PORTION`
- Perfil padrao: `FIBER`
- Itens TACO: banana, mamao, laranja, abacaxi.
- Racional: fruta troca com fruta, preservando funcao da refeicao.

### DAIRY_OPTIONS

- Nome: Laticinios
- Contexto: cafe da manha, lanches e ceia
- Papel nutricional: `DAIRY_SOURCE`
- Papel culinario: `DAIRY_SNACK`
- Perfil padrao: `PROTEIN`
- Itens TACO: leite integral, iogurte natural, queijo minas frescal.
- Racional: laticinios de lanche/complemento, com calculo posterior de porcao equivalente.

### LEGUME_OPTIONS

- Nome: Leguminosas
- Contexto: almoco e jantar
- Papel nutricional: `PLANT_PROTEIN`
- Papel culinario: `LEGUME_SIDE`
- Perfil padrao: `PROTEIN`
- Itens TACO: feijao carioca cozido, lentilha cozida.
- Racional: manter feijao/lentilha em funcao de acompanhamento proteico vegetal.

### VEGETABLE_SIDES

- Nome: Vegetais
- Contexto: almoco e jantar
- Papel nutricional: `VEGETABLE_SOURCE`
- Papel culinario: `VEGETABLE_SIDE`
- Perfil padrao: `FIBER`
- Itens TACO: brocolis cozido, cenoura cozida, alface crua.
- Racional: vegetais e acompanhamentos de baixo risco, sem misturar com amidos ou frutas.

## Limites conhecidos

- As listas iniciais sao pequenas e conservadoras.
- Alguns grupos, como oleaginosas, ovos, suplementos, bebidas e preparacoes compostas, ainda nao receberam lista `SYSTEM`.
- A qualidade clinica final depende de revisao e ampliacao por nutricionista.
- A ativacao ampla depende de comparacao com dados reais de uso.

## Recomendacao

Manter como biblioteca base em `SHADOW`, coletar metricas por contexto e ampliar listas antes de qualquer rollout `ON`.
