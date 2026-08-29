# R8.1 — Performance e privacidade

O resumo inicial é montado por `getPatientRecordSummary` com `d1Batch`; não há
N+1 por card. Módulos adicionais carregam sob demanda conforme a seção. A API
de resumo é privada/no-store e mantém autorização de admin. Nenhum endpoint ou
migration foi criado nesta entrega.

O QA autenticado usa um D1 SQLite local isolado. A primeira renderização do
workspace e suas seções foi exercitada pela suíte de prontuário sem chamadas a
serviços de produção. Não há uma métrica de duração de rota versionada na
infraestrutura atual; registrar tempos sintéticos como dado de produção seria
enganoso.
