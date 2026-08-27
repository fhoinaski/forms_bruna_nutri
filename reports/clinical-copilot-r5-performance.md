# Clinical Copilot R5 — Performance / N+1

## Medições reais (amostra local, 3 repetições, `e2e/clinical-copilot-r5-performance.spec.ts`)

| Etapa | P50 | P95 |
| --- | --- | --- |
| Montagem de contexto (`GET /draft/context`) | 75 ms | 490 ms* |
| Geração completa (`POST /draft` — LLM/fixture + resolução + nutrição, um round-trip) | 128 ms | 172 ms |

\* P95 do contexto inclui a primeira execução (cold start); rodadas
seguintes ficam abaixo de 100ms.

## Por que só 2 estágios, não 5 (honestidade sobre granularidade real)

O pedido original listava 5 estágios de progresso ("Preparando contexto",
"Gerando proposta", "Resolvendo alimentos", "Calculando nutrição", "Pronto
para revisão"). Auditoria confirmou: **hoje só 2 desses são realmente
observáveis do cliente**, porque `generateMealPlanDraft` já roda a
geração pelo LLM + a resolução em lote (`resolveFoodCandidatesWithCanonicalShadow`)
+ o cálculo de nutrição (`calculateDraftNutrition`) inteiramente dentro de
UMA ÚNICA chamada HTTP (`POST /draft`). Não existe fronteira observável
entre "gerando"/"resolvendo"/"calculando" sem reformular o backend pra
streaming (SSE) ou múltiplos round-trips sequenciais — uma mudança de
arquitetura substancial, fora do escopo aprovado desta fase.

Em vez de simular uma barra de progresso com 5 rótulos que não
corresponderiam a nenhuma fronteira real (o que seria enganoso), esta fase
manteve o spinner único já existente e mediu os DOIS estágios que já são
de fato dois round-trips HTTP distintos e reais: montagem de contexto
(etapa 1 do wizard) e geração completa (LLM+resolução+nutrição, um único
round-trip). Um streaming granular de fato fica registrado aqui como
trabalho de R5.1, junto com OPTIONS/COMBINATION.

## N+1 audit (seção 59)

Não alterado nesta fase, mas confirmado por auditoria e pelos testes
existentes: `resolveFoodCandidatesWithCanonicalShadow` já resolve TODOS os
itens de TODAS as refeições pedidas numa única chamada em lote (cache por
query normalizada + paralelo) — nunca uma busca por item/refeição
serializada. Testado em `tests/ai-meal-plan-draft-agent.test.ts` ("a mesma
query em duas refeições diferentes só busca no catálogo uma vez").

## Draft grande (seção 60)

O limite estrutural já existente (`mealPlanDraftLlmSchema`: até 6
refeições × 6 itens) é deliberado — comentário no próprio agente documenta
que volumes maiores estouravam o orçamento de tempo do provedor em teste
real (bug de 502 por timeout, já corrigido nesta mesma base). Um "draft
grande" de 6-8 refeições/30-50 itens, conforme pedido pela seção 60, excede
esse limite deliberado do MOTOR DE GERAÇÃO POR IA — mas o PLANO final,
depois de aplicado ao Composer, já é testado nesse volume pela suíte da R2
(`meal-plan-composer-r2-final-large-plan.spec.ts`, 7 refeições/~37 itens,
sem N+1) — o Copilot nesta fase gera dentro do limite atual do agente, e o
plano resultante entra no MESMO pipeline de Composer já testado nesse
volume maior.
