# R8.2 — Consultation domain

`consultation_sessions` é a entidade de atendimento: `client_id`, `appointment_id`, `admin_id`, `status` (`in_progress`, `completed`, `cancelled`), `started_at`, `ended_at`, `notes`, `summary_json`, `created_at` e `updated_at`. Notas e resumo são cifrados em repouso. Sessões concluídas/canceladas são somente leitura.

`appointments` continua responsável pela agenda e pode ser vinculada à sessão. `nutrition_records` possui versionamento próprio; antropometria vem de `client_evolutions`; planos usam `meal_plans` versionados; submissões de pré-consulta são referenciadas pelo paciente. O rascunho de consulta é salvo no `summary_json` da sessão existente. Não é necessária migration nem snapshot adicional nesta fase.
