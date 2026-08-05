# Migrations do Cloudflare D1

`db/` e a unica fonte de alteracoes estruturais do banco. O runtime em `app/` e
`lib/` nunca deve criar tabelas, indices ou colunas.

## Fluxo

1. Crie uma migration imutavel no formato `YYYYMMDD_NNNN_dominio_descricao.sql`.
2. Execute `npm run migrate:d1:check` para validar ordem, SQL e operacoes perigosas.
3. Execute `npm run migrate:d1` no ambiente de destino antes de publicar a aplicacao.
4. Execute `npm run migrate:d1:status` para confirmar checksums e ausencia de pendencias.

Cada arquivo e aplicado pela API REST como um batch transacional. O registro em
`schema_migrations` participa do mesmo batch; uma falha nao deixa a migration
marcada como concluida nem mantem as instrucoes anteriores do arquivo.

## Dominios

- `core`: formularios, clientes e administracao.
- `security_privacy`: sessao, MFA, auditoria, consentimento e LGPD.
- `clinical`: prontuario, antropometria, evolucao e protocolos.
- `scheduling`: agenda e fluxos de atendimento.
- `finance`: cobrancas e recebimentos.
- `portal`: acesso e experiencia do cliente.
- `content_ai`: blog, templates e configuracoes de IA.

As migrations `0001` e `0002` sao legado imutavel. Nao devem ser consolidadas ou
editadas porque seus checksums ja fazem parte do historico dos ambientes.

## Alteracoes destrutivas

`DROP`, renomeacoes e remocao de colunas sao bloqueados por padrao. Quando forem
inevitaveis, use uma estrategia expand/contract, documente backup e rollback no
arquivo e inclua deliberadamente o marcador `migration:allow-destructive`.
