export type GuideSection = {
  id: string;
  title: string;
  summary?: string;
  steps?: string[];
  tips?: string[];
  cautions?: string[];
  href?: string;
  linkLabel?: string;
};

export type GuideCategory = {
  id: string;
  title: string;
  kicker: string;
  description: string;
  sections: GuideSection[];
};

export const guideCategories: GuideCategory[] = [
  {
    id: "pre-consulta",
    title: "Pré-consulta e oportunidades",
    kicker: "Entrada de novos contatos",
    description:
      "Como uma pessoa interessada chega até você e o caminho até virar paciente com ficha própria.",
    sections: [
      {
        id: "pre-consulta-recebida",
        title: "Como uma pré-consulta chega até você",
        summary:
          "A pessoa interessada preenche o formulário público em /formulario, com perguntas sobre rotina, saúde e objetivos. Leva cerca de 10 minutos.",
        steps: [
          "O sistema bloqueia envios automáticos de robôs e limita a 5 tentativas por hora do mesmo endereço, para evitar spam.",
          "A resposta aparece no Dashboard como pré-consulta recente.",
          "Uma Oportunidade é criada automaticamente para você acompanhar o contato comercial sem perder o contexto.",
        ],
        href: "/dashboard",
        linkLabel: "Ver pré-consultas recentes",
      },
      {
        id: "qualificar-oportunidade",
        title: "Qualificar uma oportunidade",
        summary:
          "Oportunidades é o funil comercial: acompanha quem está interessado até a decisão de agendar.",
        steps: [
          "Abra Oportunidades e veja a lista organizada por etapa e temperatura do contato.",
          "Registre a próxima ação combinada (ex.: 'enviar valores por WhatsApp') e a data prevista.",
          "Mova a etapa conforme o contato avança — isso mantém o funil realista em vez de virar uma lista esquecida.",
        ],
        href: "/dashboard/oportunidades",
        linkLabel: "Abrir oportunidades",
      },
      {
        id: "converter-cliente",
        title: "Converter em cliente",
        summary:
          "Quando a pessoa decide seguir com o atendimento, a pré-consulta ou oportunidade vira um paciente com ficha própria.",
        steps: [
          "Na resposta da pré-consulta ou na oportunidade, use a ação de converter em cliente.",
          "A ficha do paciente é criada automaticamente com nome, contato e a pré-consulta de origem preservada como histórico.",
          "A partir daqui, use a ficha do paciente (Pacientes) para tudo: prontuário, agenda, plano alimentar e portal.",
        ],
      },
      {
        id: "cadastro-manual",
        title: "Cadastrar um paciente manualmente",
        summary:
          "Para quem já é conhecido e não passou pelo formulário público (indicação, retorno antigo, atendimento presencial direto).",
        steps: [
          "Abra Pacientes e use a opção de novo cadastro.",
          "Preencha nome (obrigatório), e-mail, telefone e data de nascimento.",
          "A ficha é criada do mesmo jeito que uma conversão — sem pré-consulta de origem, mas com todos os outros recursos disponíveis.",
        ],
        href: "/dashboard/clients",
        linkLabel: "Abrir pacientes",
      },
    ],
  },
  {
    id: "clients",
    title: "Prontuário do paciente",
    kicker: "Ficha central de cada pessoa",
    description:
      "Onde fica o histórico, a anamnese, a antropometria, o plano alimentar e a evolução de cada paciente.",
    sections: [
      {
        id: "abas-prontuario",
        title: "As abas da ficha do paciente",
        summary:
          "Cada paciente tem uma ficha com cinco abas: Resumo, Anamnese, Antropometria, Plano alimentar e Evolução.",
        steps: [
          "Resumo: dados de contato, status, acesso ao portal e visão geral rápida.",
          "Anamnese: histórico clínico, diagnósticos, medicações, alergias, restrições, preferências, rotina, sono e estresse.",
          "Antropometria: medidas atuais e classificação (ver seção própria abaixo).",
          "Plano alimentar: o cardápio ativo do paciente (ver seção própria abaixo).",
          "Evolução: histórico de peso e medidas ao longo do tempo, com gráfico.",
        ],
        href: "/dashboard/clients",
      },
      {
        id: "anamnese-sugestao-educativa",
        title: "Anamnese e sugestão automática de material educativo",
        summary:
          "O texto digitado no campo de diagnóstico é lido pelo sistema para sugerir fichas educativas relacionadas.",
        steps: [
          "Ao registrar um diagnóstico (ex.: 'diabetes tipo 2', 'hipotireoidismo'), a aba de Anamnese mostra uma sugestão da ficha educativa correspondente.",
          "Revise a sugestão e decida se faz sentido usar com aquele paciente antes de compartilhar.",
        ],
        tips: [
          "O sistema evita sugestões erradas: menções a histórico familiar ('mãe com diabetes') ou negação ('nega hipertensão') não disparam a sugestão — só o que parece ser diagnóstico da própria pessoa.",
        ],
      },
      {
        id: "portal-do-paciente",
        title: "Liberar o portal para o paciente",
        summary:
          "Dentro da ficha, é possível gerar um código de acesso individual para o paciente acompanhar o próprio cuidado.",
        steps: [
          "Na aba Resumo, gere o código de acesso ao portal.",
          "Envie o código (e o link /portal) ao paciente pelo canal que preferir.",
          "O código expira em 14 dias. Gerar um novo automaticamente invalida o anterior.",
          "É possível revogar o acesso a qualquer momento na mesma tela.",
        ],
        cautions: [
          "O portal não substitui o atendimento clínico — ele organiza combinados e orientações, não é canal de diagnóstico ou urgência.",
        ],
      },
    ],
  },
  {
    id: "antropometria",
    title: "Antropometria e classificação clínica",
    kicker: "Peso, medidas e curvas de referência",
    description:
      "Como registrar medidas e o que o sistema calcula automaticamente conforme a fase de vida do paciente.",
    sections: [
      {
        id: "registrar-evolucao",
        title: "Registrar uma nova medição",
        summary:
          "Cada evolução guarda data, peso, altura, circunferências e percentual de gordura quando disponível.",
        steps: [
          "Na aba Antropometria ou Evolução do paciente, adicione uma nova medição com a data em que foi feita.",
          "Preencha os campos disponíveis — não é obrigatório preencher todos a cada visita.",
          "O histórico alimenta o gráfico de evolução automaticamente.",
        ],
      },
      {
        id: "classificacao-por-fase-de-vida",
        title: "Classificação automática por fase de vida",
        summary:
          "O cálculo muda conforme o campo Fase do cuidado registrado na anamnese.",
        steps: [
          "Criança ou adolescente: o sistema calcula o escore-z de peso/idade, estatura/idade e IMC/idade usando as curvas de referência da OMS, e mostra uma classificação ao lado da medida.",
          "Gestação: o sistema mostra a classificação do IMC pré-gestacional e acompanha a taxa de ganho de peso semanal comparada à referência IOM/SISVAN.",
          "Fora dessas fases (adulto comum): a classificação usada é o IMC padrão, sem mudança de comportamento.",
        ],
        cautions: [
          "Toda classificação aparece como ponto de atenção para revisão profissional — o sistema nunca apresenta isso como diagnóstico fechado.",
        ],
      },
    ],
  },
  {
    id: "plano-alimentar",
    title: "Plano alimentar",
    kicker: "Montar o cardápio do paciente",
    description:
      "Como criar, editar e ativar um plano alimentar individual, usando a base de alimentos, receitas e sugestão por IA.",
    sections: [
      {
        id: "criar-plano",
        title: "Criar um plano do zero ou a partir de um modelo",
        summary:
          "Na aba Plano alimentar do paciente, escolha um grupo alvo (emagrecimento, gestante, criança etc.) e crie por modelo, ou comece um plano vazio.",
        steps: [
          "Selecione o grupo alvo mais próximo do objetivo do paciente.",
          "Use 'Criar por modelo' para já vir com refeições sugeridas daquele grupo, prontas para ajustar.",
          "Ou adicione refeições manualmente para montar do zero.",
        ],
      },
      {
        id: "adicionar-alimentos",
        title: "Adicionar alimentos com busca da base de composição",
        summary:
          "Ao digitar o nome de um alimento em um item de refeição, o sistema busca na base oficial (TACO) mais uma tabela complementar de alimentos industrializados/prontos (whey protein, granola, tapioca pronta, entre outros).",
        steps: [
          "Digite pelo menos duas letras do nome do alimento para ver sugestões.",
          "Selecione a sugestão para preencher com o nome oficial e permitir o cálculo automático de calorias, proteína, carboidrato e gordura.",
          "Ajuste a quantidade e a unidade (g, ml, unidade) conforme a porção real.",
        ],
        tips: [
          "Se um alimento não for reconhecido, o sistema avisa e não calcula macro para aquele item — vale conferir a grafia ou usar um nome mais próximo da base.",
        ],
      },
      {
        id: "inserir-receita",
        title: "Inserir uma receita da biblioteca",
        summary:
          "Em vez de montar refeição por refeição, é possível inserir uma receita pronta da biblioteca.",
        steps: [
          "Clique em 'Inserir receita' dentro do plano.",
          "Busque por nome, categoria (café da manhã, almoço etc.) ou tag.",
          "A receita entra como uma nova refeição, com os ingredientes e o macro já calculados.",
        ],
      },
      {
        id: "sugerir-com-ia-plano",
        title: "Sugerir uma refeição com IA",
        summary:
          "A IA propõe itens usando somente alimentos da base oficial ou receitas já existentes — nunca inventa um alimento fora do sistema.",
        steps: [
          "Clique em 'Sugerir com IA' na refeição desejada.",
          "Descreva um pedido opcional (ex.: 'menos carboidrato', 'sem laticínio').",
          "Revise, edite ou remova os itens sugeridos antes de salvar — a sugestão nunca é aplicada sozinha.",
        ],
        cautions: [
          "É preciso ter a chave de IA configurada em Inteligência artificial para este botão funcionar.",
        ],
      },
      {
        id: "salvar-como-receita-ou-modelo",
        title: "Promover um ajuste bom para a biblioteca",
        summary:
          "Um plano ajustado para um paciente específico pode virar receita ou modelo reaproveitável para outros pacientes.",
        steps: [
          "'Salvar como receita': transforma uma refeição específica em receita nova na biblioteca.",
          "'Salvar como modelo': transforma o plano inteiro em um modelo de dieta reutilizável para o grupo escolhido.",
        ],
        tips: [
          "Promover para a biblioteca cria uma cópia nova — o plano original do paciente não é alterado, e editar a receita/modelo depois não muda planos já entregues.",
        ],
      },
      {
        id: "grade-semanal",
        title: "Grade semanal (almoço e jantar)",
        summary:
          "Um guia simples de 7 dias × almoço/jantar que complementa o plano ativo e aparece no portal do paciente.",
        steps: [
          "Preencha título e observação de cada dia junto com o paciente, se fizer sentido para a rotina dele.",
          "Use 'Limpar grade' para recomeçar quando o plano mudar de fase.",
        ],
      },
      {
        id: "ativar-plano",
        title: "Ativar o plano no portal",
        summary:
          "Um plano pode estar em rascunho, ativo ou arquivado.",
        steps: [
          "Mude o status para 'Ativo no portal' quando o plano estiver pronto para o paciente ver.",
          "Só existe um plano ativo por paciente ao mesmo tempo — ativar um novo arquiva automaticamente o anterior (o histórico não se perde).",
        ],
      },
    ],
  },
  {
    id: "templates",
    title: "Modelos de dieta, suplementação e substituição",
    kicker: "Biblioteca reutilizável por grupo",
    description:
      "Modelos são pontos de partida organizados por grupo de cuidado — emagrecimento, hipertrofia, idoso, gestante, criança, TEA, SOP, vegetariano estrito, endurance, resistência à insulina e adulto saudável.",
    sections: [
      {
        id: "o-que-e-modelo",
        title: "O que é um modelo",
        summary:
          "Um modelo é uma dieta, uma lista de suplementos ou um conjunto de substituições já organizado para um grupo de pacientes com necessidade parecida.",
        steps: [
          "Modelos de dieta usam a mesma estrutura de refeições e itens do plano alimentar individual, incluindo busca de alimentos e inserção de receitas.",
          "Aplicar um modelo a um paciente copia o conteúdo para o plano dele — editar depois não afeta o modelo original, nem o contrário.",
        ],
        href: "/dashboard/templates",
        linkLabel: "Abrir modelos",
      },
      {
        id: "criar-editar-modelo",
        title: "Criar ou editar um modelo",
        steps: [
          "Escolha o tipo (dieta, suplementação ou substituição) e o grupo alvo.",
          "Monte as refeições/itens do mesmo jeito que no plano de um paciente, com busca de alimento e inserção de receita.",
          "Use 'Sugerir com IA' para propor um dia completo para aquele grupo, sempre revisável antes de salvar.",
        ],
      },
    ],
  },
  {
    id: "recipes",
    title: "Biblioteca de receitas",
    kicker: "Combinações prontas para reaproveitar",
    description:
      "Receitas vinculadas à base oficial de composição de alimentos, com macro calculado automaticamente.",
    sections: [
      {
        id: "buscar-receitas",
        title: "Buscar e filtrar receitas",
        steps: [
          "Use a busca por nome, tag ou descrição, e o filtro por categoria (café da manhã, almoço, lanche, jantar, sobremesa, bebida).",
          "O filtro 'Inativas' mostra também receitas arquivadas.",
        ],
        href: "/dashboard/templates/receitas",
        linkLabel: "Abrir biblioteca de receitas",
      },
      {
        id: "criar-receita",
        title: "Criar ou editar uma receita",
        steps: [
          "Informe título, categoria, rendimento em porções e modo de preparo.",
          "Adicione ingredientes usando a mesma busca de alimento do plano alimentar — o macro por porção é calculado automaticamente a partir deles.",
          "Use 'Sugerir com IA' para gerar uma lista de ingredientes de partida a partir do título e categoria informados.",
        ],
        tips: [
          "Quando um ingrediente não existe de forma exata na base (ex.: um peixe específico), a receita mostra uma nota explicando qual item mais próximo foi usado — vale ler antes de repassar ao paciente com restrição alimentar.",
        ],
      },
    ],
  },
  {
    id: "educacao",
    title: "Fichas educativas",
    kicker: "Material de apoio para explicar ao paciente",
    description:
      "Cartões de orientação em duas categorias: temas gerais de nutrição e temas por diagnóstico.",
    sections: [
      {
        id: "categorias-fichas",
        title: "Categorias disponíveis",
        steps: [
          "Geral: como ler rótulos, hidratação, fibras, açúcares escondidos, porções na mão, substituições inteligentes, fome real x emocional, lista de compras, prato ideal e grupos alimentares.",
          "Patologia: anemia ferropriva, doença celíaca, hipotireoidismo, diabetes tipo 2, hipertensão arterial, intolerância à lactose, SOP, resistência à insulina, doença renal crônica inicial e refluxo/gastrite.",
        ],
        href: "/dashboard/templates/educacao",
        linkLabel: "Abrir fichas educativas",
      },
      {
        id: "usar-fichas",
        title: "Como usar com o paciente",
        steps: [
          "Abra a ficha correspondente durante ou depois da consulta para reforçar uma orientação com linguagem simples.",
          "Lembre-se: o material é apoio educativo, não substitui a conduta individualizada definida por você.",
        ],
      },
    ],
  },
  {
    id: "protocols",
    title: "Protocolos clínicos",
    kicker: "Planos de cuidado em fases",
    description:
      "Um protocolo é um plano de cuidado dividido em fases, cada uma com período, objetivo, ações práticas e notas profissionais.",
    sections: [
      {
        id: "aplicar-protocolo-padrao",
        title: "Aplicar um protocolo padrão",
        summary: "Use quando o modelo da biblioteca já atende ao objetivo do paciente.",
        steps: [
          "Na ficha do paciente, abra Protocolos.",
          "Selecione o padrão desejado, defina início e data de revisão.",
          "Clique em Aplicar protocolo padrão.",
        ],
      },
      {
        id: "criar-versao-personalizada",
        title: "Criar uma versão personalizada",
        steps: [
          "Escolha um padrão como referência, ou deixe a seleção vazia para começar do zero.",
          "Dê um nome individual e inicie o protocolo.",
          "Abra a cópia para editar fases, ações e observações sem alterar a biblioteca original.",
        ],
      },
      {
        id: "protocolo-via-ia",
        title: "Partir de uma sugestão de IA",
        steps: [
          "Gere o rascunho a partir da pré-consulta do paciente.",
          "Revise tecnicamente o conteúdo proposto.",
          "Aprove e transforme em protocolo padrão quando estiver de acordo com sua conduta.",
        ],
        cautions: [
          "A IA organiza uma proposta; a decisão clínica e a publicação continuam sendo sempre da nutricionista.",
        ],
      },
      {
        id: "o-que-cada-opcao-preserva",
        title: "O que cada opção preserva",
        steps: [
          "Padrão: modelo reutilizável mantido na biblioteca de protocolos.",
          "Personalizado: cópia exclusiva do paciente; alterações não afetam outras pessoas.",
          "Aplicação: registro do acompanhamento com datas, notas, tarefas, progresso e status.",
          "Arquivamento: retira um modelo de novos usos sem apagar o histórico clínico já registrado.",
        ],
        href: "/dashboard/protocols",
        linkLabel: "Abrir biblioteca de protocolos",
      },
    ],
  },
  {
    id: "agenda",
    title: "Agenda e disponibilidade",
    kicker: "Consultas e mensagens automáticas",
    description:
      "Cadastro de consultas, lembretes automáticos por e-mail e a janela de horários que o paciente pode usar para se agendar sozinho.",
    sections: [
      {
        id: "criar-consulta",
        title: "Criar e acompanhar uma consulta",
        steps: [
          "Em Agenda, cadastre a consulta com paciente, tipo, data/hora e local.",
          "Acompanhe o status (agendado, confirmado, cancelado) ao longo do dia.",
        ],
        href: "/dashboard/agenda",
        linkLabel: "Abrir agenda",
      },
      {
        id: "workflow-mensagens",
        title: "Mensagens automáticas de confirmação e lembrete",
        summary:
          "Cada consulta gera automaticamente quatro pontos de contato: confirmação, lembrete 24h antes, preparo e pós-consulta.",
        steps: [
          "Quando o paciente tem e-mail cadastrado, essas mensagens são enviadas automaticamente por e-mail nos horários certos.",
          "Mensagens por WhatsApp continuam sendo enviadas manualmente — a agenda mostra um link pronto com o texto sugerido para você clicar e enviar.",
        ],
      },
      {
        id: "configurar-disponibilidade",
        title: "Configurar disponibilidade para autoagendamento",
        summary:
          "Antes do paciente poder marcar sozinho pelo portal, é preciso configurar quando você atende.",
        steps: [
          "Em Disponibilidade, cadastre regras recorrentes (ex.: segunda a sexta, 9h às 18h).",
          "Use bloqueios pontuais para férias, feriados ou qualquer período sem atendimento, sem precisar mexer nas regras recorrentes.",
        ],
        href: "/dashboard/agenda/disponibilidade",
        linkLabel: "Abrir disponibilidade",
      },
      {
        id: "autoagendamento-paciente",
        title: "Como funciona o autoagendamento do paciente",
        steps: [
          "No portal, o paciente vê apenas horários realmente livres, já descontando consultas existentes e bloqueios.",
          "Cada paciente pode ter apenas uma consulta futura marcada por vez dessa forma — evita duplicidade sem impedir o atendimento normal.",
          "Você continua podendo ajustar a agenda manualmente a qualquer momento.",
        ],
      },
    ],
  },
  {
    id: "tarefas",
    title: "Tarefas",
    kicker: "Pendências por paciente",
    description:
      "Lista operacional das orientações e pendências combinadas com cada paciente.",
    sections: [
      {
        id: "criar-acompanhar-tarefas",
        title: "Criar e acompanhar tarefas",
        steps: [
          "Crie uma tarefa vinculada ao paciente, com título, descrição e prazo quando fizer sentido.",
          "Acompanhe tarefas vencidas na tela de Tarefas ou pelo sino de notificações.",
        ],
        href: "/dashboard/tarefas",
        linkLabel: "Abrir tarefas",
      },
      {
        id: "tarefas-no-portal",
        title: "Tarefas visíveis para o paciente",
        cautions: [
          "O paciente também pode concluir tarefas pelo portal — não coloque anotações sensíveis nelas se ele não deve ler. Use as notas privadas do prontuário para contexto interno.",
        ],
      },
    ],
  },
  {
    id: "financeiro",
    title: "Financeiro",
    kicker: "Pagamentos e vencimentos",
    description: "Controle de pagamentos, status e valores recebidos ou em aberto.",
    sections: [
      {
        id: "registrar-pagamento",
        title: "Registrar um pagamento",
        steps: [
          "Cadastre descrição, valor, vencimento e método de pagamento.",
          "Atualize o status (pendente, pago, vencido) conforme o pagamento acontece.",
        ],
        href: "/dashboard/financeiro",
        linkLabel: "Abrir financeiro",
      },
      {
        id: "aviso-vencido",
        title: "Aviso automático de pagamento vencido",
        summary:
          "Quando um pagamento passa da data de vencimento, o sistema envia um e-mail de aviso ao paciente automaticamente, uma única vez por cobrança.",
      },
    ],
  },
  {
    id: "portal",
    title: "Portal do paciente",
    kicker: "O que a pessoa acompanhada vê",
    description:
      "Um espaço simples, acessado com e-mail e código, para o paciente acompanhar o próprio cuidado sem acesso ao restante do sistema.",
    sections: [
      {
        id: "o-que-aparece-no-portal",
        title: "O que aparece no portal",
        steps: [
          "Próximas consultas confirmadas e a opção de se autoagendar dentro dos horários liberados.",
          "Tarefas pendentes, com opção de marcar como concluída.",
          "Protocolo ativo e suas fases, quando aplicável.",
          "Plano alimentar ativo e a grade semanal, quando preenchida.",
          "Pagamentos pendentes ou vencidos.",
        ],
      },
      {
        id: "gerenciar-acesso-portal",
        title: "Gerenciar o acesso",
        steps: [
          "Gere, renove ou revogue o código de acesso pela ficha do paciente, aba Resumo.",
          "Gerar um novo código invalida imediatamente o anterior.",
        ],
      },
    ],
  },
  {
    id: "notificacoes",
    title: "Notificações",
    kicker: "O sino no topo do painel",
    description:
      "Um resumo do que é novo ou está atrasado, reunido a partir de dados que já existem no sistema.",
    sections: [
      {
        id: "o-que-o-sino-mostra",
        title: "O que o sino reúne",
        steps: [
          "Tarefas vencidas.",
          "Consultas do dia.",
          "Rascunhos de IA aguardando revisão.",
          "Pagamentos vencidos.",
          "Oportunidades no funil.",
          "Solicitações de privacidade em aberto.",
          "Novas pré-consultas.",
        ],
        tips: [
          "Cada item do sino leva direto para a tela correspondente — use como atalho, não só como aviso.",
        ],
      },
    ],
  },
  {
    id: "privacidade",
    title: "Privacidade e LGPD",
    kicker: "Direitos dos titulares e auditoria",
    description:
      "Solicitações de acesso, correção, exclusão, retenção de dados e histórico de eventos sensíveis.",
    sections: [
      {
        id: "solicitacoes-privacidade",
        title: "Atender uma solicitação de titular",
        steps: [
          "Abra Privacidade e localize a solicitação recebida.",
          "Verifique a identidade da pessoa por um canal já cadastrado antes de qualquer ação — nunca apenas pelos dados enviados no próprio pedido.",
          "Só depois de identidade verificada é possível exportar ou anonimizar os dados relacionados.",
        ],
        href: "/dashboard/privacidade",
        linkLabel: "Abrir privacidade",
      },
      {
        id: "retencao-auditoria",
        title: "Retenção e auditoria",
        steps: [
          "Ajuste o período de retenção conforme sua política; o sistema mostra uma prévia de quantos registros entrariam em revisão de descarte.",
          "A exclusão nunca é automática — sempre depende de uma decisão explícita.",
          "O histórico de auditoria registra login, alterações sensíveis e ações de privacidade, para consulta quando necessário.",
        ],
      },
    ],
  },
  {
    id: "seguranca",
    title: "Segurança da conta",
    kicker: "Senha, MFA e sessões",
    description: "Como manter o acesso ao dashboard protegido.",
    sections: [
      {
        id: "senha-mfa",
        title: "Senha e autenticação em duas etapas",
        steps: [
          "Troque a senha em Configurações de segurança sempre que desconfiar de exposição.",
          "Ative a autenticação em duas etapas (MFA) com um aplicativo autenticador para uma camada extra de proteção.",
          "Guarde os códigos de recuperação em local seguro — eles permitem entrar caso perca acesso ao aplicativo autenticador.",
        ],
        href: "/dashboard/settings/security",
        linkLabel: "Abrir segurança",
      },
    ],
  },
  {
    id: "ia",
    title: "Inteligência artificial",
    kicker: "Onde e como a IA participa",
    description:
      "A IA sempre propõe um rascunho para revisão — nunca aplica uma mudança sozinha em dado de paciente, protocolo, receita ou modelo.",
    sections: [
      {
        id: "configurar-ia",
        title: "Configurar provedor e chave",
        steps: [
          "Em Inteligência artificial, escolha o provedor e o modelo.",
          "Informe a chave de API — ela fica protegida e nunca é exibida por completo depois de salva.",
          "Ajuste os prompts do sistema se quiser mudar o tom ou o critério técnico usado nas sugestões.",
        ],
        href: "/dashboard/settings/ai",
        linkLabel: "Abrir configurações de IA",
      },
      {
        id: "onde-ia-atua",
        title: "Onde a IA é usada hoje",
        steps: [
          "Rascunho de protocolo a partir da pré-consulta.",
          "Sugestão de refeição dentro do plano alimentar.",
          "Sugestão de ingredientes ao criar uma receita.",
          "Sugestão de um dia completo ao criar um modelo de dieta.",
        ],
        cautions: [
          "Em todos os casos, a IA escolhe apenas entre alimentos e receitas que já existem no sistema — ela não inventa itens novos, e toda sugestão fica em revisão até você confirmar.",
        ],
      },
      {
        id: "assistente-chat-flutuante",
        title: "Assistente de chat flutuante",
        summary:
          "O botão redondo no canto inferior direito, disponível em qualquer tela do dashboard, abre um chat que explica como usar o sistema e, em algumas telas, também ajuda a preencher dados — sempre com revisão antes de salvar.",
        steps: [
          "Clique no botão para abrir e digite sua dúvida, ou escolha uma das perguntas rápidas sugeridas.",
          "As respostas de uso do sistema vêm do mesmo conteúdo da Central de Ajuda — se a dúvida não estiver coberta, ele avisa em vez de inventar um passo que não existe.",
          "De qualquer tela, diga o que precisa fazer (ex.: \"vou atender a Fulana agora\", \"abre o cliente Beltrano\", \"abre a agenda\") e o assistente navega sozinho até a tela certa — se houver mais de um cliente com nome parecido, ele pergunta qual antes de abrir.",
          "Também dá para pedir o cadastro de um paciente novo direto pelo chat (ex.: \"cadastre um paciente novo chamado Pedro, telefone tal\"). Ele monta a proposta com os dados que você informou, mostra para revisão e só cria o cadastro de verdade (abrindo a ficha em seguida) depois que você confirmar.",
          "O mesmo vale para receitas novas na biblioteca: peça algo como \"cria uma receita baixa caloria para quem quer emagrecer\" e ele busca ingredientes reais na TACO, monta o modo de preparo e mostra tudo para revisão (título, grupo, porções, ingredientes) antes de salvar de verdade. Definir o que é clinicamente adequado (ex.: quantas calorias, quais trocas) continua sendo decisão da nutricionista — o sistema só busca os alimentos e calcula os valores.",
          "Com a ficha de um cliente aberta (seja porque você navegou manualmente ou porque o assistente te levou até lá), ele sabe qual paciente está em tela: descreva o caso ou dite observações e ele propõe o preenchimento dos campos de texto do prontuário (histórico, queixa, rotina, plano de cuidado etc.), pode criar um protocolo personalizado simples do zero (título, categoria, descrição, notas — sem fases/tarefas predefinidas) e também pode atualizar as notas profissionais de um protocolo já atribuído ao cliente.",
          "Para um protocolo clínico completo e estruturado (fases, tarefas, materiais educativos) baseado nas respostas de um formulário, continue usando o fluxo de \"Gerar rascunho de protocolo com IA\" a partir da pré-análise — o chat não substitui esse fluxo, só oferece uma opção mais simples e rápida quando não é preciso tanta estrutura.",
          "De qualquer tela, também dá para pedir um rascunho de post para o blog (ex.: \"escreve um post sobre alimentação saudável na gestação\"). Ele preenche título, resumo, conteúdo em Markdown, categoria, tags e também título/descrição SEO, sempre como RASCUNHO — nunca publica sozinho. Revise (com a barra de formatação e a pré-visualização do editor) e publique na tela do blog quando estiver pronto.",
          "Ainda na ficha do cliente, ele também enxerga o plano alimentar ativo: peça para revisar a dieta atual (ex.: \"reavalia esse plano\", \"tem algo errado nessa dieta?\") e ele comenta pontos de atenção — distribuição de macros, repetição de alimentos, porções fora do esperado — e pode propor um ajuste de conduta no prontuário. Ele não edita as refeições sozinho; para trocar itens de verdade, use o editor de plano alimentar (com o \"Sugerir com IA\" de cada refeição).",
          "Com um formulário de pré-consulta aberto (tela da submissão), peça um resumo do caso e ele propõe o preenchimento da pré-análise (resumo, pontos de atenção, objetivo, restrições e notas) com base nas respostas do paciente.",
          "Dá para anexar um arquivo (PDF ou imagem, até 9 MB) clicando no clipe ao lado do campo de mensagem — útil para mandar um exame ou resultado e pedir ajuda para interpretar ou complementar o prontuário com base nele.",
          "Em qualquer um desses casos, a proposta aparece campo a campo dentro do próprio chat, já editável. Revise, corrija ou desmarque o que não quiser usar e só então clique no botão de aplicar — nada é salvo sem essa confirmação.",
        ],
        cautions: [
          "O assistente nunca dá conduta clínica, diagnóstico ou decide tratamento — ele só ajuda a redigir/organizar o que a nutricionista já sabe do caso, inclusive ao ler um arquivo anexado.",
          "Navegar até uma tela é automático (é só trocar de página, dá pra voltar a qualquer momento), mas nenhuma alteração de dados é salva sozinha: até você clicar em aplicar, a proposta fica só na tela do chat e pode ser descartada sem efeito nenhum.",
          "Nem todo modelo de IA consegue ler arquivos anexados — se o provedor configurado não suportar, o chat avisa em vez de travar.",
          "Também depende da chave de IA configurada acima; sem ela, o chat avisa e leva direto para esta tela.",
        ],
      },
    ],
  },
  {
    id: "duvidas-frequentes",
    title: "Perguntas frequentes",
    kicker: "Problemas comuns e como resolver",
    description: "Situações que costumam gerar dúvida no dia a dia.",
    sections: [
      {
        id: "paciente-nao-acessa-portal",
        title: "O paciente não consegue entrar no portal",
        steps: [
          "Confira se o código não expirou (validade de 14 dias a partir da geração).",
          "Confirme se o e-mail usado no login é exatamente o mesmo cadastrado na ficha.",
          "Se necessário, gere um novo código na ficha do paciente — isso substitui o anterior.",
        ],
      },
      {
        id: "email-nao-chega",
        title: "Lembretes ou avisos por e-mail não estão chegando",
        steps: [
          "Confirme que o paciente tem e-mail cadastrado na ficha.",
          "Peça para verificar a caixa de spam.",
          "Se o problema for geral (nenhum e-mail saindo), avise o suporte técnico — pode ser configuração pendente do provedor de e-mail.",
        ],
      },
      {
        id: "botao-ia-desabilitado",
        title: "O botão \"Sugerir com IA\" está desabilitado",
        steps: [
          "Isso acontece quando não há chave de IA configurada.",
          "Vá em Inteligência artificial e configure provedor, modelo e chave.",
        ],
      },
      {
        id: "plano-sem-macro",
        title: "Um item do plano aparece sem cálculo de calorias",
        steps: [
          "Significa que o nome digitado não foi reconhecido na base de alimentos.",
          "Use o autocomplete (digite e escolha uma sugestão) em vez de digitar o nome livremente, para garantir o reconhecimento.",
        ],
      },
    ],
  },
];
