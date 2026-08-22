# Future UX Behavior — Fase 5.5 (item 13)

Gerado em: 2026-08-22. **Não implementado nesta fase** — nenhuma UI foi
alterada; isto documenta o comportamento pretendido pra quando (e se) o
resolver canônico for realmente ativado, servindo de referência pra Fase
6+.

| Situação (features/policy V2) | Comportamento futuro |
|---|---|
| `queryRisk = LOW_RISK` + `canAutoResolveCanonicalV2().autoAccept = true` | Auto-resolve — usa o candidato direto, sem perguntar nada. |
| `status = AMBIGUOUS` (ou `varietyRequired = true`) | Mostrar 2-5 opções pra nutricionista escolher (mesmo padrão já usado pelo resolver atual em `FoodResolutionCandidate[]`). |
| `status = PREPARATION_REVIEW` | Perguntar o preparo explicitamente (ou oferecer as receitas candidatas já buscadas por `findRecipeCandidatesForPreparation`, reaproveitando o mecanismo do resolver atual). |
| `varietyRequired = true` (item 7) | Perguntar a variedade/cultivar explicitamente — nunca escolher uma variante sozinho mesmo com score alto. |
| `status = NOT_FOUND` (nem atual nem canônico acham) | Fallback pro caminho já existente: resolver atual → USDA → edição manual. |
| `matchClass = FTS_PARTIAL` mesmo com `queryRisk = LOW_RISK` | Tratar como sugestão, não decisão — mostrar como "candidato provável" com opção de confirmar em 1 clique, nunca aplicar automaticamente. |

Nenhum destes fluxos foi implementado — são só a especificação de como a
policy V2 (quando/se ativada) deveria se conectar à interface.
