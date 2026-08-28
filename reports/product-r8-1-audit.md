# R8.1 — Auditoria do Patient Workspace

Base auditada: `main` em `7ff69481147f45b855c6c9da3150109c41c152b4`.

O workspace principal é `/dashboard/clients/:id`; a consulta é aberta em
`/dashboard/clients/:id/consulta`. A página já carrega snapshot, resumo
agregado e atividade recente no servidor. O resumo usa um `d1Batch`, evitando
uma requisição por indicador. As APIs de resumo e portal exigem sessão admin e
respondem com `Cache-Control: private, no-store`.

Módulos identificados: resumo, consultas, anamnese, antropometria, plano
alimentar/Composer, protocolos, evolução/timeline, tarefas, financeiro,
relatório e portal. Não há domínio de arquivos/documentos nem módulo de
mensagens entre profissional e paciente. Recomendações individuais existem de
forma parcial em protocolos, suplementação e plano, mas não há recurso próprio
de recomendações vinculado ao paciente.

Mudanças pendentes de R6.5 estavam presentes no diretório de trabalho. Esta
entrega não as altera e não cria migrations.

## Lineage — fechamento

- Branch atual: `main`; HEAD/base/merge-base: `7ff69481147f45b855c6c9da3150109c41c152b4`.
- Os commits já integrados relacionados à ficha são `77ce6a6`, `181ae12` e
  `7ff6948`; a alteração R8.1 continua não commitada no worktree.
- `db/20260826_0069_meal_plan_flexible_structure.sql` está não rastreada,
  acompanhada de alterações de Meal Plan/Clinical Copilot. Classificação: **C
  — migration ainda não aprovada para a lineage atual**. Não pertence ao R8.1
  e não foi removida nem mascarada.
- Consequentemente, a árvore não é uma base release-safe para fechar R8.1.
  A estratégia segura é criar uma branch empilhada a partir de uma base que já
  tenha aprovado o stream Meal Plan/Copilot, ou aguardar esse fechamento;
  nenhum rebase, reset, clean ou cherry-pick foi executado.
