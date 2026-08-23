# Curated Exchange Lists Architecture

Data: 2026-08-22

## Objetivo

Implementar listas profissionais reutilizaveis de equivalentes para o Plano Alimentar, separando:

- qual alimento pode substituir: lista curada, de contexto clinico/profissional;
- qual quantidade e equivalente: calculo deterministico ja existente no motor de substituicoes.

A implementacao nao cria um novo calculador nutricional. Ela reduz o universo de candidatos antes do motor calcular equivalencia.

## Benchmark publico consultado

- Nutrium Help: [How to create a weekly meal plan?](https://help.nutrium.com/en/articles/2015765-how-to-create-a-weekly-meal-plan)
- Nutrium Help: [Does Nutrium offer pre-made meal plans?](https://help.nutrium.com/en/articles/595939-does-nutrium-offer-pre-made-meal-plans)
- Nutrium Help: [How can I create lists of equivalents and food groups and share them with my clients](https://help.nutrium.com/en/articles/1592533-how-can-i-create-lists-of-equivalents-and-food-groups-and-share-them-with-my-clients)
- Nutrium Blog: [Create your own food lists](https://nutrium.com/blog/create-your-own-food-lists/)
- Nutrium Blog: [Nutrium step-by-step guide](https://nutrium.com/blog/nutrium-step-by-step-guide/)
- Nutrium Blog: [Now you can print your lists of equivalents](https://nutrium.com/blog/now-you-can-print-your-lists-of-equivalents/)
- Dietbox Blog: [Quer saber como calcular a lista de substituicao de alimentos?](https://blog.dietbox.me/quer-saber-como-calcular-a-lista-de-substituicao-de-alimentos/)

Uso do benchmark: principios de produto, nao layout, texto, codigo, assets ou comportamento proprietario.

## Arquitetura reutilizada

- `exchange_groups`: continua sendo o snapshot persistido de um grupo de alternativas para um item do plano.
- `exchange_group_alternatives`: continua armazenando alternativas sugeridas/aprovadas/rejeitadas.
- `meal_plan_substitutions`: permanece como historico/compatibilidade legada.
- `food-exchange-engine`: continua classificando grupo, funcao, contexto, deduplicacao e diversidade.
- `substitution-engine`: continua calculando equivalencia nutricional e quantidade.
- `nutrition-engine`: continua calculando totais do plano usando alimento principal, nao alternativas sugeridas.
- Portal e impressao: continuam consumindo apenas plano aprovado/publicado.

## Novas entidades

- `exchange_lists`: biblioteca de listas curadas. Cada lista tem origem `SYSTEM` ou `USER`, contexto alimentar, papel nutricional, versao e status ativo.
- `exchange_list_items`: itens da lista, apontando para alimentos reais do catalogo via `food_source`, `food_ref_id` e `canonical_food_id`.
- `diet_template_slots.exchange_list_id`: vinculo opcional entre slot de template e lista curada.
- `exchange_groups.exchange_list_id`, `exchange_list_version`, `exchange_generation_mode`: proveniencia do grupo gerado.
- `exchange_group_alternatives.candidate_origin`: origem de cada candidato.

## Fluxo hibrido

1. O item principal e classificado por grupo, subgrupo, papel nutricional, contexto da refeicao e papel culinario.
2. O resolvedor tenta encontrar lista curada nesta ordem:
   - lista explicita ou lista vinculada ao slot de template;
   - lista de contexto compatibilizada com refeicao e funcao;
   - fallback por papel nutricional.
3. Os itens da lista viram candidatos reais do catalogo.
4. O `generateHybridExchangeAlternatives` roda o motor existente sobre candidatos curados.
5. Se a lista curada nao completar o limite, o motor automatico complementa com fallback validado.
6. Todas as quantidades equivalentes continuam vindo do motor deterministico.
7. Todas as alternativas continuam nascendo como `SUGGESTED`.

## Modos de rollout

Controlado por `CURATED_EXCHANGE_LISTS_MODE`:

- `off`: comportamento atual, apenas motor automatico.
- `shadow`: calcula hibrido para validacao, mas persiste engine-only.
- `pilot`: usa hibrido quando existir lista resolvida e alternativas validas.
- `on`: modo amplo, somente recomendado apos evidencia objetiva superior.

O default permanece `off`.

## Pontos de controle clinico

- A lista curada define candidatos elegiveis, mas nao aprova nada.
- A IA pode pedir mais opcoes ou filtros no futuro, mas nao calcula nutrientes nem publica plano.
- Quantidades equivalentes seguem rastreaveis e deterministicas.
- Paciente recebe apenas alternativas aprovadas/publicadas pelo fluxo existente.

## Riscos e mitigacoes

- Risco: lista curada pequena reduzir variedade. Mitigacao: fallback automatico validado e rollout em `shadow`.
- Risco: vinculo errado em template. Mitigacao: lista e versao persistidas no grupo gerado para auditoria.
- Risco: duplicar motor de equivalencia. Mitigacao: nenhuma nova regra calcula quantidade; todo calculo passa por `substitution-engine`.
- Risco: ativacao prematura. Mitigacao: flag default `off` e recomendacao atual `SHADOW`.
