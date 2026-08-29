# R6.5.6 — Estados de loading/empty/erro na Biblioteca de Reuso

## Loading

`Skeleton` (`role="status"`, `aria-label="Carregando biblioteca"`) renderiza
4 blocos pulsantes de placeholder enquanto `loading === true`. Idêntico em
espírito ao padrão já estabelecido no Food Search (R6.5.5).

## Empty state por aba

| Aba | Texto | Verificado |
| --- | --- | --- |
| Itens (Recentes) | "Nenhum alimento recente." | E2E indireto (dados sempre presentes nos testes existentes) |
| Itens (Favoritos) | "Nenhum favorito." | idem |
| Refeições | "Nenhuma refeição salva." | leitura de código |
| Planos | "Nenhum outro plano deste paciente ainda." | **E2E direto** (`estado vazio: sem recentes/modelos...`) — corrigido nesta fase (Bug 3) |
| Modelos | "Nenhum modelo disponível." | leitura de código |

## Erro + retry

Ao falhar qualquer fetch (`try/catch` em `load()`), o componente mostra um
card de erro (`"Não foi possível carregar a biblioteca."`) com um botão
"Tentar novamente" que rechama `load()` sem fechar o drawer nem recarregar
a página — nunca quebra o Composer. Confirmado por leitura de código;
comportamento inalterado nesta fase (nenhum caso de E2E força uma falha de
rede real, mas a lógica é idêntica ao padrão já usado no Food Search).

## Bug corrigido nesta fase

O texto do estado vazio da aba "Planos" havia sofrido uma deriva de cópia
durante o redesign ("Nenhum plano anterior." em vez do contrato
estabelecido "Nenhum outro plano deste paciente ainda."), quebrando o teste
`estado vazio: sem recentes/modelos mostra mensagem clara, nunca quebra o
Composer`. Restaurado ao texto original (Bug 3 do relatório de auditoria).
