# Patient Workspace UX — estado atual auditado

## Escopo auditado

- Rota e carregamento: `app/dashboard/clients/[id]/page.tsx`.
- Workspace e navegação: `app/dashboard/clients/[id]/ClientWorkspace.tsx`.
- Dados de resumo: `lib/repositories/patient-record-summary.ts`.
- Integrações preservadas: Modo Consulta, antropometria, plano alimentar, agenda, protocolos, portal e impressão.

## Inventário de duplicidades encontradas

| Intenção | Antes | Problema |
| --- | --- | --- |
| Consulta | Header, estado clínico, indicador de última consulta, empty state da timeline | até quatro chamadas para a mesma intenção |
| Avaliação | Header, estado clínico, indicador de peso, empty state da timeline | até quatro chamadas para a mesma intenção |
| Plano alimentar | Header, estado clínico, indicador, lateral | rótulos conflituosos: abrir, criar e continuar |

Nenhuma regra clínica, tabela, endpoint ou autorização foi alterada durante a auditoria.
