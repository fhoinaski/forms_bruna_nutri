# Segurança, backup e resposta a incidentes

## Rotina mínima

- Ativar autenticação em duas etapas para toda conta administrativa.
- Executar `npm run backup:d1` diariamente em ambiente protegido.
- Manter `BACKUP_ENCRYPTION_KEY` fora do repositório e em cofre de segredos.
- Conservar ao menos uma cópia criptografada fora do provedor principal.
- Testar a restauração trimestralmente em banco isolado.
- Revisar mensalmente o painel Privacidade e os eventos de auditoria.

## Restauração

1. Criar um banco D1 isolado para o teste.
2. Configurar as credenciais desse banco, a chave original e `RESTORE_CONFIRM=BRUNA_NUTRI_RESTORE`.
3. Executar `npm run restore:d1 -- backups/arquivo.enc`.
4. Conferir contagens, consultas, prontuários e logs antes de qualquer troca de ambiente.

O processo usa importação segura com `INSERT OR REPLACE`; ele não apaga registros que não estejam no backup.

## Incidente com dados pessoais

1. Conter o acesso, preservar evidências e registrar horário, sistema e pessoas envolvidas.
2. Trocar credenciais potencialmente expostas e revogar integrações afetadas.
3. Identificar titulares, categorias de dados, volume, duração e possíveis consequências.
4. Acionar assessoria jurídica e avaliar comunicação à ANPD e aos titulares quando houver risco ou dano relevante.
5. Restaurar apenas a partir de cópia verificada, acompanhar o ambiente e documentar correções.
6. Registrar a conclusão e revisar controles para evitar recorrência.

Dados de saúde e dados de crianças exigem atenção reforçada. Não envie cópias de prontuários por canais pessoais ou não autorizados durante a investigação.
