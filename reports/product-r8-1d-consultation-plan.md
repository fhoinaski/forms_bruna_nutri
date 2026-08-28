# R8.1D — Consulta → Plano alimentar

Fluxo validado: Consulta → `getMealPlanHref(clientId, { consultationId })` →
`/dashboard/clients/:id?tab=plano-alimentar&returnTo=consulta&consultationId=:id`
→ `ClientWorkspace` → `MealPlanEditor` → link “Voltar à consulta”.

O teste autenticado isolado passou, inclusive com retorno para a mesma sessão.
Não houve 401, 403, 404, 409, 422 ou 500 na reprodução isolada; o trace não
registrou console error nem erro de boundary. Nenhuma mudança foi necessária.
