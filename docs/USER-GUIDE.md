# Guia de Uso — Bruna Flores Nutri

> Guia prático para o dia a dia. Para detalhes técnicos, veja [`SYSTEM-COMPLETE-GUIDE.md`](./SYSTEM-COMPLETE-GUIDE.md).

## Como começar

1. Acesse `/login` e entre com seu e-mail e senha.
2. No primeiro acesso, o sistema pode pedir para você trocar a senha inicial — faça isso em **Configurações → Segurança**.
3. Recomendado: ative a verificação em duas etapas (MFA) na mesma tela, com um aplicativo autenticador (Google Authenticator, Authy, etc.). Guarde os códigos de recuperação mostrados — eles só aparecem uma vez.
4. Você cai no **Dashboard**, seu painel de trabalho do dia.

## Como cadastrar paciente

- Pelo **Dashboard** ou pela lista de **Pacientes**, clique em "Novo paciente".
- Preencha nome, telefone, e-mail e data de nascimento.
- Ou, se o paciente já enviou uma pré-consulta pelo site, abra a pré-consulta em "Pré-consultas" (na tela inicial) e clique em "Converter em cliente" — os dados já vêm preenchidos.

## Como enviar pré-consulta

Você não envia — o **paciente** preenche o formulário público (`/formulario` no seu site). Ele pode aparecer de duas formas, dependendo do que você configurou em **Configurações → IA**:
- **Formulário tradicional**: perguntas fixas, o paciente preenche direto.
- **Guiado por IA**: uma conversa que vai perguntando uma coisa de cada vez.

Se a IA não estiver configurada, o sistema usa automaticamente o formulário tradicional, sem quebrar nada.

Quando o paciente envia, ele aparece na tabela **"Pré-consultas"** logo na tela inicial do Dashboard.

## Como consultar paciente

- Vá em **Pacientes**, use a busca por nome/telefone/e-mail, ou use a busca rápida no topo de qualquer tela.
- Clique no paciente para abrir a ficha completa, com 5 abas: **Resumo, Anamnese, Antropometria, Plano alimentar, Evolução**.

## Como registrar antropometria

Na ficha do paciente, aba **Antropometria**: registre peso, altura, circunferências e outras medidas. O sistema calcula automaticamente IMC, relação cintura-quadril e outros índices, sempre respeitando o sexo biológico informado (alguns cálculos exigem isso). O histórico fica salvo e disponível na aba **Evolução**.

## Como usar marcadores clínicos (alergias e restrições)

Na aba **Anamnese**, seção de restrições estruturadas: adicione um marcador (Alergia, Intolerância, Restrição alimentar, Alimento a evitar) escolhendo o código certo (ex.: Leite ≠ Lactose, Trigo ≠ Glúten — são coisas diferentes, escolha o que realmente se aplica). Marque a gravidade e o status (Ativo, Suspeito, Resolvido). Isso alimenta diretamente a segurança das sugestões de substituição — nunca ignore um marcador "suspeito" achando que não vale a pena registrar.

## Como criar plano alimentar

1. Na ficha do paciente, aba **Plano alimentar**.
2. Clique em **"Criar por modelo"**, escolha o grupo-alvo (ex.: Emagrecimento, Gestante) — o sistema monta refeições, substituições e suplementos a partir dos seus modelos cadastrados.
3. Ou adicione refeições manualmente com o botão "Refeição".
4. Em cada refeição, busque o alimento (a busca já traz TACO, USDA e seus alimentos personalizados juntos), ajuste quantidade e, se disponível, escolha uma medida caseira (ex.: "1 colher de sopa") em vez de digitar gramas.
5. Você pode duplicar refeições/alimentos, reordenar, trocar o alimento ("Substituir") ou remover.
6. Acompanhe os macros em tempo real no rodapé — atenção aos avisos de "estimativa" (quando o sistema não tem certeza da conversão para gramas).

## Como usar a Central de Alimentos

- Menu **Alimentos**: busque qualquer alimento, filtre por fonte (TACO, USDA, Personalizados, Fabricantes).
- Abra o detalhe para ver a composição completa por 100g, calcular uma quantidade específica, comparar até 4 alimentos lado a lado, e ver/editar o perfil clínico (quais alergênicos o alimento contém) — edição só disponível para alimentos que você cadastrou.
- Cadastre um alimento próprio ou de fabricante em "Novo alimento".

## Como ativar plano

- No editor do plano, clique em **"Ativar"** (ou salve com o status "Ativo no portal").
- O plano anterior que estava ativo é automaticamente arquivado — nunca apagado, você sempre pode consultar o histórico.
- **Atenção a conflitos**: se você tiver o plano aberto em duas abas/dispositivos e salvar em um enquanto edita no outro, o sistema vai recusar o segundo salvamento com um aviso de conflito e um botão "Recarregar plano" — nunca vai sobrescrever silenciosamente o que já foi salvo.

## Como usar a agenda

- Menu **Agenda**: veja o dia, crie consultas, confirme, cancele, reagende.
- Configure sua disponibilidade em **Agenda → Disponibilidade** (horários recorrentes por dia da semana + bloqueios pontuais como férias).
- O sistema envia lembretes automáticos por WhatsApp e e-mail (confirmação, 24h antes, preparo, pós-consulta) — você não precisa fazer nada manualmente para isso acontecer.
- **Não há sincronização com Google Calendar** — a agenda é só deste sistema.

## Como registrar pagamentos

- Menu **Financeiro**: registre uma cobrança (valor, vencimento, método, categoria).
- Quando receber, marque como "Pago" manualmente.
- **Não existe cobrança automática nem gateway de pagamento** — tudo aqui é registro manual do que você já recebeu ou vai receber. Se quiser enviar um link de pagamento, cole-o no campo próprio (gerado por você em outro serviço).
- O sistema avisa automaticamente por e-mail quando uma cobrança fica vencida.

## Como usar o Portal do Paciente

- Na ficha do paciente, aba Resumo → "Portal do cliente": clique em **"Gerar código"** para criar (ou renovar) o acesso. Envie o código (formato `BF-XXXX-XXXX`) por e-mail ou WhatsApp para o paciente.
- O paciente entra em `/portal` com o e-mail cadastrado + esse código.
- Lá ele vê o plano alimentar, próxima consulta (pode confirmar presença ou se autoagendar), tarefas, e pode conversar com o assistente de IA (que só responde sobre os dados dele).
- Se o paciente pedir uma troca de alimento ou tiver uma dúvida, isso vira uma **solicitação** — revise em **Solicitações**.
- Para revogar o acesso, desative na mesma tela — invalida o acesso na hora, mesmo que o paciente ainda esteja logado.

## Como usar o Assistente de IA

- Clique no ícone de chat flutuante em qualquer tela do dashboard.
- Pergunte coisas como "quantas calorias tem 100g de arroz?", "qual o plano da Maria?", "quais consultas tenho hoje?".
- Peça ações como "adicione banana no café da manhã da Maria" ou "reagende a consulta" — o assistente **sempre monta uma proposta e pede sua confirmação antes de qualquer mudança real**. Nada é salvo sem você clicar em confirmar.
- Se o assistente detectar que você já tem um marcador clínico igual ao que pediu para criar, ele avisa em vez de duplicar.
- O assistente nunca aplica sozinho uma mudança clínica (prontuário, plano, marcador) — sempre aparece um card de proposta para você revisar antes.

## Como configurar IA

- **Configurações → IA**: escolha o provedor (OpenAI, Anthropic, Google, etc.), cole a chave de API, escolha o modelo.
- A chave nunca é mostrada de novo depois de salva — só aparece mascarada. Se você não mexer nesse campo ao salvar outras coisas, a chave configurada continua valendo.
- Ali também: modo da pré-consulta (tradicional ou guiado por IA) e se as "substituições seguras" automáticas estão habilitadas no portal do paciente (troca só é feita automaticamente pelo chat do paciente em casos muito restritos — TACO por TACO, sem sinal clínico, sem conflito com nenhum marcador registrado; qualquer outro caso vira solicitação para você revisar).

## Como usar segurança/MFA

- **Configurações → Segurança**: troque sua senha quando quiser (a senha atual é sempre exigida).
- Para ativar a verificação em duas etapas: clique em "Ativar com aplicativo autenticador", escaneie o QR code, digite o código de 6 dígitos para confirmar. Guarde os códigos de recuperação — eles são a única forma de entrar se você perder o celular.
- Trocar a senha ou desativar o MFA encerra automaticamente qualquer outra sessão aberta em outros dispositivos.

---

## Perguntas frequentes

**O sistema tem app de celular?** Não — é um site responsivo, funciona no navegador do celular.

**Posso ter outra nutricionista usando o sistema comigo?** Hoje não — o sistema foi desenhado para um único login administrativo, sem múltiplos usuários/permissões.

**Consigo gerar um PDF do plano alimentar?** Você consegue imprimir (e usar "Salvar como PDF" do seu navegador) — não existe geração de PDF automática dentro do sistema ainda.

**O paciente pode mudar o próprio plano?** Não diretamente — ele pode pedir uma troca pelo chat, que vira uma solicitação para você revisar e decidir.

**E se dois dispositivos salvarem o mesmo plano ao mesmo tempo?** O sistema bloqueia o segundo salvamento com um aviso e pede para recarregar — nunca sobrescreve silenciosamente.
