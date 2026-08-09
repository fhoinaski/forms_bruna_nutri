export type HelpTopic = {
  title: string;
  body: string;
};

export const dashboardHelpTopics = {
  dashboard: {
    title: "Dashboard",
    body: "Visao geral do dia, com pre-consultas, agenda, tarefas, oportunidades e financeiro. Comece por aqui para decidir qual atendimento, pendencia ou acao precisa de prioridade.",
  },
  clients: {
    title: "Pacientes",
    body: "Ficha central de cada paciente, com dados, prontuario, portal, protocolos, agenda, tarefas, financeiro, timeline e relatorios. Use esta area para acompanhar o cuidado completo depois que uma pessoa vira cliente.",
  },
  agenda: {
    title: "Agenda",
    body: "Cadastro de consultas, status, local, preparos e fluxos de mensagem antes e depois do atendimento. Revise o dia, confirme presencas e mantenha os proximos passos claros.",
  },
  "agenda/disponibilidade": {
    title: "Disponibilidade",
    body: "Configure janelas recorrentes e bloqueios para o autoagendamento do portal. Mantenha regras simples, revise feriados e bloqueie periodos em que nao deve haver marcacao.",
  },
  templates: {
    title: "Modelos",
    body: "Biblioteca de dietas, protocolos, substituicoes e materiais reutilizaveis. Use modelos como ponto de partida e personalize no prontuario antes de entregar ao cliente.",
  },
  "templates/receitas": {
    title: "Receitas",
    body: "Biblioteca de receitas com ingredientes, preparo e estimativas nutricionais quando houver dados suficientes. Reaproveite combinacoes boas em planos alimentares sem reescrever tudo.",
  },
  "templates/educacao": {
    title: "Fichas educativas",
    body: "Materiais de orientacao para apoiar explicacoes ao paciente. Revise o texto, mantenha linguagem simples e use como complemento ao atendimento, nao como substituto da conduta profissional.",
  },
  financeiro: {
    title: "Financeiro",
    body: "Controle de pagamentos, vencimentos, status e valores recebidos ou em aberto. Use para acompanhar pendencias e manter o historico financeiro do atendimento organizado.",
  },
  oportunidades: {
    title: "Oportunidades",
    body: "Funil comercial humano para transformar pre-consultas em clientes sem perder o contexto familiar. Atualize temperatura, etapa e proxima acao para conduzir o contato com clareza.",
  },
  tarefas: {
    title: "Tarefas",
    body: "Lista operacional das orientacoes e pendencias por cliente. A paciente tambem pode concluir tarefas no portal quando elas forem pensadas para acompanhamento externo.",
  },
  protocols: {
    title: "Protocolos",
    body: "Biblioteca de protocolos e fases do cuidado. Podem nascer de rascunhos de IA ou ser criados manualmente, sempre com revisao profissional antes de uso.",
  },
  privacidade: {
    title: "Privacidade",
    body: "Solicitacoes LGPD, exportacao, anonimizacao, retencao e auditoria de eventos sensiveis. Verifique identidade antes de qualquer acao sobre dados pessoais.",
  },
  blog: {
    title: "Blog",
    body: "Conteudo do site, com API para agente de IA publicar posts e fortalecer autoridade organica. Revise titulo, status, SEO e texto antes de publicar.",
  },
  "settings/ai": {
    title: "Inteligencia artificial",
    body: "Configuracao do provedor, modelo, chave e prompts usados pelos recursos de IA. Mantenha a chave protegida e revise os prompts quando o tom ou o criterio tecnico precisarem mudar.",
  },
  "settings/security": {
    title: "Seguranca",
    body: "Senha, MFA, sessoes, auditoria, limite de tentativas e protecoes administrativas. Use esta area para reforcar acesso seguro ao dashboard.",
  },
} as const satisfies Record<string, HelpTopic>;

export type HelpTopicKey = keyof typeof dashboardHelpTopics;
