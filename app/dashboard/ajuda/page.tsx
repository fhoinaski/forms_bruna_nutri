import Link from "next/link";
import {
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Copy,
  HeartHandshake,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  LibraryBig,
  LockKeyhole,
  Newspaper,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import { dashboardHelpTopics, type HelpTopicKey } from "@/lib/help/content";

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

const moduleKeys: HelpTopicKey[] = [
  "dashboard",
  "clients",
  "agenda",
  "agenda/disponibilidade",
  "templates",
  "templates/receitas",
  "templates/educacao",
  "financeiro",
  "oportunidades",
  "tarefas",
  "protocols",
  "privacidade",
  "blog",
  "settings/ai",
  "settings/security",
];

const moduleMeta: Record<HelpTopicKey, { icon: typeof Users; href: string }> = {
  dashboard: { icon: LayoutDashboard, href: "/dashboard" },
  clients: { icon: Users, href: "/dashboard/clients" },
  agenda: { icon: CalendarDays, href: "/dashboard/agenda" },
  "agenda/disponibilidade": { icon: CalendarDays, href: "/dashboard/agenda/disponibilidade" },
  templates: { icon: LibraryBig, href: "/dashboard/templates" },
  "templates/receitas": { icon: BookOpen, href: "/dashboard/templates/receitas" },
  "templates/educacao": { icon: KeyRound, href: "/dashboard/templates/educacao" },
  financeiro: { icon: WalletCards, href: "/dashboard/financeiro" },
  oportunidades: { icon: HeartHandshake, href: "/dashboard/oportunidades" },
  tarefas: { icon: ClipboardList, href: "/dashboard/tarefas" },
  protocols: { icon: BookOpen, href: "/dashboard/protocols" },
  privacidade: { icon: ShieldCheck, href: "/dashboard/privacidade" },
  blog: { icon: Newspaper, href: "/dashboard/blog" },
  "settings/ai": { icon: Bot, href: "/dashboard/settings/ai" },
  "settings/security": { icon: LockKeyhole, href: "/dashboard/settings/security" },
};

const modules = moduleKeys.map((key) => ({
  ...dashboardHelpTopics[key],
  ...moduleMeta[key],
}));

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
    title: "Aplicar um protocolo padrao",
    text: "Use quando o modelo da biblioteca ja atende ao objetivo da cliente. Na ficha, abra Protocolos, selecione o padrao, defina inicio e revisao e clique em Aplicar protocolo padrao.",
  },
  {
    icon: Copy,
    title: "Criar uma versao personalizada",
    text: "Escolha um padrao como referencia ou deixe a selecao vazia para comecar do zero. De um nome individual, inicie o protocolo e depois abra a copia para editar fases, acoes e observacoes sem alterar a biblioteca.",
  },
  {
    icon: Sparkles,
    title: "Partir de uma sugestao de IA",
    text: "Gere o rascunho a partir da pre-consulta, revise tecnicamente, aprove e transforme em protocolo padrao. A IA organiza uma proposta; a decisao clinica e a publicacao continuam sendo da nutricionista.",
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
                <p className="mt-2 text-sm leading-6 text-[#75675E]">{item.body}</p>
              </div>
            );
            return <Link href={item.href} key={item.title}>{content}</Link>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[#D9E4D3] bg-[#F7FAF5] p-6">
        <div className="max-w-3xl">
          <p className="brand-kicker mb-2">Guia de protocolos</p>
          <h2 className="font-serif text-3xl font-semibold">Como organizar e usar protocolos clinicos</h2>
          <p className="mt-3 text-sm leading-7 text-[#75675E]">
            Um protocolo e um plano de cuidado dividido em fases. Cada fase reune periodo, objetivo, acoes praticas e notas profissionais. Ao iniciar um protocolo para uma cliente, as acoes podem virar tarefas com prazo e aparecer no portal.
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
              <li><strong className="text-[#3A3028]">1. Avalie:</strong> revise prontuario, objetivos, restricoes, rotina e contexto familiar.</li>
              <li><strong className="text-[#3A3028]">2. Escolha:</strong> aplique um padrao somente quando ele se encaixar; caso contrario, personalize.</li>
              <li><strong className="text-[#3A3028]">3. Planeje:</strong> defina inicio, primeira revisao e se as acoes devem gerar tarefas.</li>
              <li><strong className="text-[#3A3028]">4. Acompanhe:</strong> registre notas, evolucao das tarefas e ajuste o status para ativo, pausado, concluido ou cancelado.</li>
              <li><strong className="text-[#3A3028]">5. Revise:</strong> adapte a copia individual conforme adesao e evolucao, sem modificar o padrao original.</li>
            </ol>
          </div>
          <div className="rounded-xl bg-white p-5">
            <h3 className="font-serif text-xl font-semibold">O que cada opcao preserva</h3>
            <div className="mt-4 space-y-3 text-sm leading-6 text-[#75675E]">
              <p><strong className="text-[#3A3028]">Padrao:</strong> modelo reutilizavel e mantido na Biblioteca de Protocolos.</p>
              <p><strong className="text-[#3A3028]">Personalizado:</strong> copia exclusiva da cliente; alteracoes nao afetam outras pessoas.</p>
              <p><strong className="text-[#3A3028]">Aplicacao:</strong> registro do acompanhamento com datas, notas, tarefas, progresso e status.</p>
              <p><strong className="text-[#3A3028]">Arquivamento:</strong> retira um modelo de novos usos sem apagar o historico clinico ja registrado.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard/protocols" className="brand-btn-primary">Abrir biblioteca</Link>
          <Link href="/dashboard/protocols/novo" className="brand-btn-secondary">Criar protocolo padrao</Link>
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
