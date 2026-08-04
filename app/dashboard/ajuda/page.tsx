import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  HeartHandshake,
  HelpCircle,
  KeyRound,
  LockKeyhole,
  Newspaper,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  Copy,
} from "lucide-react";

const flow = [
  {
    title: "1. Receber uma pre-consulta",
    text: "A paciente preenche o formulario publico. A resposta entra no dashboard como nova oportunidade de atendimento.",
    href: "/dashboard",
    label: "Ver respostas",
  },
  {
    title: "2. Qualificar a oportunidade",
    text: "Use Oportunidades para acompanhar interessados, temperatura do lead, proxima acao e conversao para cliente.",
    href: "/dashboard/oportunidades",
    label: "Abrir oportunidades",
  },
  {
    title: "3. Converter em cliente",
    text: "Quando houver fit, converta a resposta em cliente. A ficha passa a concentrar prontuario, agenda, tarefas, portal e relatorios.",
    href: "/dashboard/clients",
    label: "Ver clientes",
  },
  {
    title: "4. Organizar o cuidado",
    text: "Preencha o prontuario, aplique protocolos, crie tarefas e agende consultas. O portal mostra apenas o que a paciente deve acompanhar.",
    href: "/dashboard/clients",
    label: "Abrir CRM",
  },
];

const modules = [
  { icon: Users, title: "Clientes", text: "Ficha central de cada paciente, com dados, prontuario, portal, protocolos, agenda, tarefas, financeiro, timeline e relatorios.", href: "/dashboard/clients" },
  { icon: FileText, title: "Prontuario", text: "Aba dentro do cliente para anamnese, historico, antropometria, exames, conduta, objetivos e sinais de atencao." },
  { icon: KeyRound, title: "Portal do cliente", text: "Aba dentro do cliente para liberar codigo individual. A paciente acessa /portal com e-mail e codigo." },
  { icon: CalendarDays, title: "Agenda", text: "Cadastro de consultas, status, local, preparos e fluxos de mensagem antes e depois do atendimento.", href: "/dashboard/agenda" },
  { icon: ClipboardList, title: "Tarefas", text: "Lista operacional das orientacoes e pendencias por cliente. A paciente tambem pode concluir tarefas no portal.", href: "/dashboard/tarefas" },
  { icon: BookOpen, title: "Protocolos", text: "Biblioteca de protocolos e fases do cuidado. Podem nascer de rascunhos IA ou ser criados manualmente.", href: "/dashboard/protocols" },
  { icon: HeartHandshake, title: "Oportunidades", text: "Funil comercial humano para transformar pre-consultas em clientes sem perder o contexto familiar.", href: "/dashboard/oportunidades" },
  { icon: WalletCards, title: "Financeiro", text: "Controle de pagamentos, vencimentos, status e valores recebidos ou em aberto.", href: "/dashboard/financeiro" },
  { icon: Newspaper, title: "Blog", text: "Conteudo do site, com API para agente de IA publicar posts e fortalecer autoridade organica.", href: "/dashboard/blog" },
  { icon: ShieldCheck, title: "Privacidade", text: "Solicitacoes LGPD, exportacao, anonimização, retencao e auditoria de eventos sensiveis.", href: "/dashboard/privacidade" },
  { icon: LockKeyhole, title: "Seguranca", text: "Senha, MFA, sessoes, auditoria, limite de tentativas e protecoes administrativas.", href: "/dashboard/settings/security" },
];

const routines = [
  "Todo dia: revisar novas pre-consultas, oportunidades quentes, consultas do dia e tarefas vencidas.",
  "Antes da consulta: abrir a ficha da cliente, revisar prontuario, respostas de origem, evolucoes e plano ativo.",
  "Depois da consulta: atualizar prontuario, registrar evolucao, ajustar tarefas, agenda e portal.",
  "Toda semana: revisar financeiro, blog, oportunidades atrasadas e pedidos de privacidade.",
];

const warnings = [
  "O portal do cliente nao substitui atendimento clinico; ele organiza combinados e orientacoes.",
  "O codigo do portal aparece apenas quando e gerado. Ao gerar outro, o anterior deixa de funcionar.",
  "Nao coloque notas sensiveis em tarefas se a paciente nao deve ler. Use notas privadas do prontuario para contexto interno.",
  "Antes de publicar em producao, aplique todas as migracoes D1 novas.",
];

const protocolPaths = [
  {
    icon: BookOpen,
    title: "Aplicar um protocolo padrão",
    text: "Use quando o modelo da biblioteca já atende ao objetivo da cliente. Na ficha, abra Protocolos, selecione o padrão, defina início e revisão e clique em Aplicar protocolo padrão.",
  },
  {
    icon: Copy,
    title: "Criar uma versão personalizada",
    text: "Escolha um padrão como referência ou deixe a seleção vazia para começar do zero. Dê um nome individual, inicie o protocolo e depois abra a cópia para editar fases, ações e observações sem alterar a biblioteca.",
  },
  {
    icon: Sparkles,
    title: "Partir de uma sugestão de IA",
    text: "Gere o rascunho a partir da pré-consulta, revise tecnicamente, aprove e transforme em protocolo padrão. A IA organiza uma proposta; a decisão clínica e a publicação continuam sendo da nutricionista.",
  },
];

export default function HelpDashboardPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="brand-kicker mb-3">Central de ajuda</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028]">
              Como usar o sistema no dia a dia
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#75675E]">
              Guia operacional para transformar pre-consultas em acompanhamento completo, com clareza para a nutricionista e uma experiencia simples para a paciente.
            </p>
          </div>
          <div className="rounded-2xl bg-[#EEF3EA] p-4 text-sm text-[#607A56]">
            <p className="font-semibold">Fluxo principal</p>
            <p className="mt-1 text-xs leading-5">Pre-consulta, oportunidade, cliente, prontuario, agenda/protocolo e portal.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {flow.map((item) => (
          <div key={item.title} className="rounded-2xl border border-[#E6D5C5] bg-white/75 p-5">
            <CheckCircle2 className="mb-4 h-5 w-5 text-[#607A56]" />
            <h2 className="font-serif text-lg font-semibold text-[#3A3028]">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#75675E]">{item.text}</p>
            <Link href={item.href} className="mt-4 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] hover:text-[#B47F6A]">
              {item.label}
            </Link>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[#E6D5C5] bg-white/75 p-6">
        <div className="mb-5 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#B47F6A]" />
          <h2 className="font-serif text-2xl font-semibold">Mapa dos modulos</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((item) => {
            const Icon = item.icon;
            const content = (
              <div className="h-full rounded-2xl border border-[#EFE2D6] bg-[#FBF7F1] p-5 transition hover:border-[#D9C4B2]">
                <Icon className="mb-3 h-5 w-5 text-[#607A56]" />
                <h3 className="font-serif text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#75675E]">{item.text}</p>
              </div>
            );
            return item.href ? <Link href={item.href} key={item.title}>{content}</Link> : <div key={item.title}>{content}</div>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[#D9E4D3] bg-[#F7FAF5] p-6">
        <div className="max-w-3xl">
          <p className="brand-kicker mb-2">Guia de protocolos</p>
          <h2 className="font-serif text-3xl font-semibold">Como organizar e usar protocolos clínicos</h2>
          <p className="mt-3 text-sm leading-7 text-[#75675E]">
            Um protocolo é um plano de cuidado dividido em fases. Cada fase reúne período, objetivo, ações práticas e notas profissionais. Ao iniciar um protocolo para uma cliente, as ações podem virar tarefas com prazo e aparecer no portal.
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {protocolPaths.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="rounded-xl border border-[#D9E4D3] bg-white p-5">
                <Icon className="h-5 w-5 text-[#607A56]" />
                <h3 className="mt-4 font-serif text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#75675E]">{item.text}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-5">
            <h3 className="font-serif text-xl font-semibold">Fluxo recomendado</h3>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-[#75675E]">
              <li><strong className="text-[#3A3028]">1. Avalie:</strong> revise prontuário, objetivos, restrições, rotina e contexto familiar.</li>
              <li><strong className="text-[#3A3028]">2. Escolha:</strong> aplique um padrão somente quando ele se encaixar; caso contrário, personalize.</li>
              <li><strong className="text-[#3A3028]">3. Planeje:</strong> defina início, primeira revisão e se as ações devem gerar tarefas.</li>
              <li><strong className="text-[#3A3028]">4. Acompanhe:</strong> registre notas, evolução das tarefas e ajuste o status para ativo, pausado, concluído ou cancelado.</li>
              <li><strong className="text-[#3A3028]">5. Revise:</strong> adapte a cópia individual conforme adesão e evolução, sem modificar o padrão original.</li>
            </ol>
          </div>
          <div className="rounded-xl bg-white p-5">
            <h3 className="font-serif text-xl font-semibold">O que cada opção preserva</h3>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[#75675E]">
              <p><strong className="text-[#3A3028]">Padrão:</strong> modelo reutilizável e mantido na Biblioteca de Protocolos.</p>
              <p><strong className="text-[#3A3028]">Personalizado:</strong> cópia exclusiva da cliente; alterações não afetam outras pessoas.</p>
              <p><strong className="text-[#3A3028]">Aplicação:</strong> registro do acompanhamento com datas, notas, tarefas, progresso e status.</p>
              <p><strong className="text-[#3A3028]">Arquivamento:</strong> retira um modelo de novos usos sem apagar o histórico clínico já registrado.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard/protocols" className="brand-btn-primary">Abrir biblioteca</Link>
          <Link href="/dashboard/protocols/novo" className="brand-btn-secondary">Criar protocolo padrão</Link>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#E6D5C5] bg-white/75 p-6">
          <div className="mb-5 flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-[#607A56]" />
            <h2 className="font-serif text-2xl font-semibold">Rotina recomendada</h2>
          </div>
          <div className="space-y-3">
            {routines.map((item) => (
              <p key={item} className="rounded-xl bg-[#FBF7F1] p-4 text-sm leading-6 text-[#75675E]">{item}</p>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E6D5C5] bg-white/75 p-6">
          <div className="mb-5 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#B47F6A]" />
            <h2 className="font-serif text-2xl font-semibold">Cuidados importantes</h2>
          </div>
          <div className="space-y-3">
            {warnings.map((item) => (
              <p key={item} className="rounded-xl border border-[#EAD8C2] bg-white p-4 text-sm leading-6 text-[#75675E]">{item}</p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
