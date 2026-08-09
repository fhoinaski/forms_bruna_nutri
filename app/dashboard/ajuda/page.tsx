import Link from "next/link";
import {
  Activity,
  Bell,
  Bot,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  HeartHandshake,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  LibraryBig,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Users,
  Utensils,
  WalletCards,
} from "lucide-react";
import { dashboardHelpTopics, type HelpTopicKey } from "@/lib/help/content";
import { guideCategories, type GuideCategory } from "@/lib/help/guide-content";

const flow = [
  {
    title: "1. Receber uma pré-consulta",
    text: "A paciente preenche o formulário público. A resposta entra no dashboard como nova oportunidade de atendimento.",
    href: "/dashboard",
    label: "Ver respostas",
  },
  {
    title: "2. Qualificar a oportunidade",
    text: "Use Oportunidades para acompanhar interessados, temperatura do lead, próxima ação e conversão para cliente.",
    href: "/dashboard/oportunidades",
    label: "Abrir oportunidades",
  },
  {
    title: "3. Converter em cliente",
    text: "Quando houver fit, converta a resposta em cliente. A ficha passa a concentrar prontuário, agenda, tarefas, portal e relatórios.",
    href: "/dashboard/clients",
    label: "Ver clientes",
  },
  {
    title: "4. Organizar o cuidado",
    text: "Preencha o prontuário, aplique protocolos, crie tarefas e agende consultas. O portal mostra apenas o que a paciente deve acompanhar.",
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
  "templates/educacao": { icon: GraduationCap, href: "/dashboard/templates/educacao" },
  financeiro: { icon: WalletCards, href: "/dashboard/financeiro" },
  oportunidades: { icon: HeartHandshake, href: "/dashboard/oportunidades" },
  tarefas: { icon: ClipboardList, href: "/dashboard/tarefas" },
  protocols: { icon: BookOpen, href: "/dashboard/protocols" },
  privacidade: { icon: ShieldCheck, href: "/dashboard/privacidade" },
  blog: { icon: Sparkles, href: "/dashboard/blog" },
  "settings/ai": { icon: Bot, href: "/dashboard/settings/ai" },
  "settings/security": { icon: LockKeyhole, href: "/dashboard/settings/security" },
};

const modules = moduleKeys.map((key) => ({
  ...dashboardHelpTopics[key],
  ...moduleMeta[key],
}));

const routines = [
  "Todo dia: revisar novas pré-consultas, oportunidades quentes, consultas do dia e tarefas vencidas.",
  "Antes da consulta: abrir a ficha da cliente, revisar prontuário, respostas de origem, evoluções e plano ativo.",
  "Depois da consulta: atualizar prontuário, registrar evolução, ajustar tarefas, agenda e portal.",
  "Toda semana: revisar financeiro, blog, oportunidades atrasadas e pedidos de privacidade.",
];

const warnings = [
  "O portal do cliente não substitui atendimento clínico; ele organiza combinados e orientações.",
  "O código do portal aparece apenas quando é gerado. Ao gerar outro, o anterior deixa de funcionar.",
  "Não coloque notas sensíveis em tarefas se a paciente não deve ler. Use notas privadas do prontuário para contexto interno.",
  "Toda sugestão de IA fica em rascunho para revisão — nenhuma é aplicada sozinha em dado de paciente.",
];

const categoryIcons: Record<GuideCategory["id"], typeof Users> = {
  "pre-consulta": HeartHandshake,
  clients: Users,
  antropometria: Activity,
  "plano-alimentar": Utensils,
  templates: LibraryBig,
  recipes: BookOpen,
  educacao: GraduationCap,
  protocols: BookOpen,
  agenda: CalendarDays,
  tarefas: ClipboardList,
  financeiro: WalletCards,
  portal: KeyRound,
  notificacoes: Bell,
  privacidade: ShieldCheck,
  seguranca: LockKeyhole,
  ia: Bot,
  "duvidas-frequentes": HelpCircle,
};

export default function HelpDashboardPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="brand-kicker mb-3">Central de ajuda</p>
            <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028]">
              Guia completo de uso do sistema
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#75675E]">
              Instruções detalhadas para cada área do dashboard, do primeiro contato com a
              paciente até o acompanhamento clínico completo. Use o índice para ir direto ao
              que precisa.
            </p>
          </div>
          <div className="rounded-2xl bg-[#EEF3EA] p-4 text-sm text-[#607A56]">
            <p className="font-semibold">Fluxo principal</p>
            <p className="mt-1 text-xs leading-5">Pré-consulta, oportunidade, cliente, prontuário, agenda/protocolo e portal.</p>
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
          <h2 className="font-serif text-2xl font-semibold">Mapa rápido dos módulos</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((item) => {
            const Icon = item.icon;
            return (
              <Link href={item.href} key={item.title}>
                <div className="h-full rounded-2xl border border-[#EFE2D6] bg-[#FBF7F1] p-5 transition hover:border-[#D9C4B2]">
                  <Icon className="mb-3 h-5 w-5 text-[#607A56]" />
                  <h3 className="font-serif text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#75675E]">{item.body}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav
          aria-label="Índice do guia"
          className="rounded-2xl border border-[#E6D5C5] bg-white/75 p-4 lg:sticky lg:top-24 lg:h-fit lg:self-start"
        >
          <p className="mb-3 px-2 text-xs font-bold uppercase tracking-[0.12em] text-[#8C6E52]">
            Índice do guia
          </p>
          <ul className="space-y-1">
            {guideCategories.map((category) => {
              const Icon = categoryIcons[category.id];
              return (
                <li key={category.id}>
                  <a
                    href={`#${category.id}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-[#75675E] transition hover:bg-[#FBF7F1] hover:text-[#3A3028]"
                  >
                    {Icon && <Icon className="h-4 w-4 shrink-0 text-[#607A56]" />}
                    <span className="truncate">{category.title}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-6">
          {guideCategories.map((category) => {
            const Icon = categoryIcons[category.id];
            return (
              <section
                key={category.id}
                id={category.id}
                className="scroll-mt-24 rounded-2xl border border-[#E6D5C5] bg-white/75 p-6"
              >
                <div className="mb-5 flex items-start gap-3">
                  {Icon && (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF0E4] text-[#607A56]">
                      <Icon className="h-5 w-5" />
                    </span>
                  )}
                  <div>
                    <p className="brand-kicker mb-1">{category.kicker}</p>
                    <h2 className="font-serif text-2xl font-semibold text-[#3A3028] sm:text-3xl">
                      {category.title}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#75675E]">
                      {category.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {category.sections.map((section) => (
                    <article
                      key={section.id}
                      id={section.id}
                      className="scroll-mt-24 rounded-xl border border-[#EFE2D6] bg-[#FBF7F1] p-5"
                    >
                      <h3 className="font-serif text-lg font-semibold text-[#3A3028]">
                        {section.title}
                      </h3>
                      {section.summary && (
                        <p className="mt-2 text-sm leading-6 text-[#75675E]">{section.summary}</p>
                      )}
                      {section.steps && (
                        <ol className="mt-3 space-y-2 text-sm leading-6 text-[#75675E]">
                          {section.steps.map((step, index) => (
                            <li key={step} className="flex gap-2">
                              <span className="font-semibold text-[#607A56]">{index + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                      {section.tips && (
                        <div className="mt-3 space-y-2">
                          {section.tips.map((tip) => (
                            <p
                              key={tip}
                              className="rounded-lg bg-[#EAF0E4] px-3 py-2 text-xs leading-5 text-[#4F6847]"
                            >
                              <strong className="font-semibold">Dica: </strong>
                              {tip}
                            </p>
                          ))}
                        </div>
                      )}
                      {section.cautions && (
                        <div className="mt-3 space-y-2">
                          {section.cautions.map((caution) => (
                            <p
                              key={caution}
                              className="rounded-lg border border-[#EAD8C2] bg-white px-3 py-2 text-xs leading-5 text-[#8C5F50]"
                            >
                              <strong className="font-semibold">Atenção: </strong>
                              {caution}
                            </p>
                          ))}
                        </div>
                      )}
                      {section.href && (
                        <Link
                          href={section.href}
                          className="mt-4 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] hover:text-[#B47F6A]"
                        >
                          {section.linkLabel ?? "Abrir"}
                        </Link>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
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
