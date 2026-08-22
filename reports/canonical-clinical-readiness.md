# Clinical Readiness Audit — Fase 5 (item 9)

Gerado em: 2026-08-22. Avalia se o resolver canônico já consegue fornecer,
de forma confiável, cada peça de dado que o plano alimentar precisa.

| Item | Status | Justificativa |
|---|---|---|
| **Alimento** (identidade) | **READY** | `resolveCanonicalFood` resolve EXACT/RESOLVED/AMBIGUOUS/PREPARATION_REVIEW/NOT_FOUND de forma determinística, nunca escolhe ambíguo sozinho (mesmo padrão do resolver atual). Fase 4/4.5 validaram 0 erros de query em 519-520 casos reais. |
| **Preparação** | **PARTIAL** | O canônico detecta preparo pedido e rejeita candidatos que não satisfazem (`PREPARATION_REVIEW`), mas **não** tem o equivalente do resolver atual a `findRecipeCandidatesForPreparation` (busca de receita real pra representar um preparo composto sem match direto) — hoje só devolve "não encontrado com esse preparo", sem sugerir uma receita cadastrada. |
| **Quantidade / medidas caseiras** | **PARTIAL** | Ver `reports/canonical-portions-readiness.md`: 69,2% das 8.157 medidas têm grama explícita e são seguras hoje; 30,8% (só-mL ou parsed_from_label) não devem entrar em cálculo automático sem revisão. |
| **Nutrientes** | **PARTIAL** | Ver `reports/canonical-nutrient-readiness.md`: CORE bem coberto nas 3 fontes; CLINICAL (minerais/vitaminas) só bem coberto na TBCA — IBGE_POF praticamente não tem minerais/vitaminas raras, TACO não tem FOLATE/B12/VITAMIN_D/ADDED_SUGAR/ADDED_SALT. |
| **Source** | **READY** | Todo resultado canônico carrega `source` (TBCA/TACO/IBGE_POF) e `sourceFoodId` — nunca omitido, nunca inferido. |
| **Provenance** | **READY** | `source_detail_url`, `source_version`, `import_batch_id` preservados desde a importação (Fase 1) em toda linha de `canonical_foods`/`food_nutrient_values`/`canonical_food_portions` — auditável até a fonte original. |

## Conclusão

O canônico está **READY** para identidade/source/provenance, e **PARTIAL**
em preparação/porções/nutrientes clínicos — nenhum desses PARTIALs é um
bloqueador de shadow mode (que não altera nada entregue ao usuário), mas
são exatamente os pontos que precisam fechar antes de qualquer
`prefer_canonical` real: hoje ativar canônico pra um alimento cuja
quantidade só existe em mL, ou cujo nutriente clínico relevante (ex.:
sódio pra um paciente hipertenso, vindo de um alimento IBGE_POF) não é
reportado pela fonte, seria pior que manter o resolver atual — que hoje
usa TACO/USDA, ambos com cobertura de minerais mais completa que
IBGE_POF.
