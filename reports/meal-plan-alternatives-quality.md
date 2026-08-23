# Meal Plan Alternatives Quality

## Objetivo

Refinar ranking e apresentação das alternativas sem reescrever o Nutrition Engine, sem alterar o resolver canônico e sem mudar a persistência principal.

## Critério aplicado

Cada alternativa gerada passa a receber, no motor determinístico:

- `DIRECT_EXCHANGE`
- `SAME_SUBGROUP`
- `SAME_GROUP`
- `COMPATIBLE_ROLE`
- `CROSS_GROUP`

A ordenação agora prioriza essa hierarquia antes do score numérico. A qualidade visual fica simplificada em:

- `HIGH`
- `MEDIUM`
- `LOW`

Alternativas `LOW` não entram automaticamente no resultado padrão.

## UX aplicada

No painel do item:

- alternativas aprovadas aparecem separadas;
- sugestões aparecem em `Alternativas diretas` e `Outras equivalências`;
- a lista inicial mostra até 3 sugestões;
- `Ver mais` expande o restante;
- selos mostram `mesmo subgrupo`, `mesmo grupo`, `equivalência alta` ou `equivalência moderada`;
- busca manual e IA ficam recolhidas em `+ Adicionar alternativa` / `Pedir sugestão específica`.

## Golden cases

### Pão integral

Primary: `Pão, trigo, forma, integral`

Diretas:

- Pães de forma calculáveis aparecem antes de outras equivalências.

Mesmo subgrupo / outras equivalências:

- Arroz, cereais e farinhas ficam abaixo das trocas diretas.

### Ovo cozido

Primary: `Ovo, de galinha, inteiro, cozido/10minutos`

Diretas:

- Outro ovo calculável aparece como troca direta.

### Banana prata

Primary: `Banana, prata, crua`

Diretas:

- Variações de banana não podem ocupar toda a lista inicial.

Outras frutas:

- Outras frutas/frutas equivalentes aparecem como alternativas de mesmo subgrupo.

### Arroz integral

Primary: `Arroz, integral, cozido`

Diretas:

- Arroz aparece primeiro.

Mesmo subgrupo:

- Pães, milho e cereais aparecem depois como equivalências.

### Frango

Primary: `Frango, peito, sem pele, cru`

Diretas:

- Cortes/preparos de frango aparecem antes.

Mesmo subgrupo:

- Outras aves aparecem depois.

### Queijo minas

Primary: `Queijo, minas, frescal`

Diretas:

- Queijo minas aparece primeiro.

Mesmo subgrupo:

- Outros queijos aparecem depois.

## Testes

Cobertura adicionada/validada:

- direct exchange vem primeiro;
- same subgroup antes de same group;
- LOW não aparece automaticamente;
- top 3 limita concentração por família;
- quantidade continua calculada;
- aprovação e persistência continuam no E2E;
- busca manual continua funcionando atrás de `+ Adicionar alternativa`;
- IA permanece secundária.
