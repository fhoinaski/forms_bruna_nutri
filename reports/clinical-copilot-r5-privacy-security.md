# Clinical Copilot R5 — Privacidade / Segurança

## Auditoria do contexto enviado ao provider (não alterado nesta fase)

`buildMealPlanDraftContext` (`meal-plan-draft-agent.ts`) monta o contexto
SÓ com campos clinicamente relevantes: idade calculada, sexo biológico,
peso/altura/IMC, fase do cuidado, objetivos, alergias, restrições,
preferências/aversões alimentares, marcadores clínicos ativos, e o
plano ativo atual (só título + meta energética). **Nenhum campo de PII
direta** (nome de contato, telefone, email, endereço, documento) existe
nesse objeto — nem por omissão de schema, nem por redação posterior.

Antes de qualquer coisa ser enviada ao provider, `sanitizeClinicalContext`
(`lib/ai/privacy/sanitize-context.ts`) aplica DUAS camadas:

1. **Pseudonimização do nome**: `pseudonymizeName` transforma o nome real
   em `"Paciente NNNN"` (hash estável) — o nome real nunca chega ao modelo.
2. **Redação de PII residual + anti-injeção**: cada seção do contexto passa
   por `wrapUntrustedData`/`redactPii`, que também isola o conteúdo como
   dado (nunca instrução) para o modelo.

Nenhuma alteração foi necessária nesta fase — auditado e confirmado que já
satisfaz a seção 8/88 do pedido.

## Logging (seções 8/54/89)

`ai_meal_plan_draft_generated`/`ai_meal_plan_draft_failed`/
`ai_meal_plan_draft_meal_regenerated`/`ai_meal_plan_draft_optimized` já
existiam via `writeAuditLog` (`lib/security/audit.ts`), com metadata
SEMPRE agregada (contagens, flags, `durationMs`) — nunca prompt/resposta
clínica bruta. Auditado e confirmado: nenhum log inseguro. Nenhuma chamada
de auditoria nova foi necessária para o modo "plano anterior" — ele
reaproveita a MESMA `generateMealPlanDraft`/rota `/draft`, então já emite
o mesmo `ai_meal_plan_draft_generated` de sempre.

## Auth / IDOR (seções 86/87)

Nenhuma rota nova foi criada nesta fase (a única mudança de API foi um
campo opcional adicional, `otherMealsContext`, na rota `/draft` já
existente e já autenticada). A auditoria confirma: todas as rotas de IA já
exigem `getAdminFromRequest`/`getClientById` (paciente escopado por id da
URL, nunca aceita um id arbitrário fora do path) — nenhuma mudança de
comportamento de autorização nesta fase.

## Nunca autoridade sobre nutrientes/identidade (seções 50/51 — testado explicitamente)

Ver `reports/clinical-copilot-r5-structured-draft.md` e
`tests/clinical-copilot-r5-authority.test.ts`: kcal/macros e
`canonicalFoodId`/`food_ref_id` inventados são descartados pelo schema
estrito antes de qualquer outra lógica rodar — testado nesta fase de forma
explícita (complementando a cobertura já existente de
`tests/ai-meal-plan-draft-agent.test.ts`).
