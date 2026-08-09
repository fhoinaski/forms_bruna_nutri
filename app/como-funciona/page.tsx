//explica ndo como funciona o atendimento nutricional com Bruna Flores, incluindo pré-consulta, análise individualizada, plano alimentar e acompanhamento em Florianópolis ou online.
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChartNoAxesCombined, ClipboardList, SearchCheck, Sprout } from "lucide-react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { SectionTitle } from "@/components/public/SectionTitle";
import { StepCard } from "@/components/public/StepCard";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { siteConfig } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Como funciona o atendimento nutricional",
  description:
    "Entenda como funciona o atendimento nutricional com Bruna Flores: pré-consulta, análise individualizada, plano alimentar e acompanhamento em Florianópolis ou online.",
  alternates: { canonical: "/como-funciona" },
  openGraph: {
    type: "website",
    url: "/como-funciona",
    title: "Como funciona o atendimento nutricional",
    description:
      "Pré-consulta, análise individualizada, plano alimentar e acompanhamento nutricional presencial em Florianópolis ou online.",
    images: [siteConfig.ogImagePath],
  },
  twitter: {
    card: "summary_large_image",
    title: "Como funciona o atendimento nutricional",
    description:
      "Entenda a pré-consulta, a consulta e o acompanhamento nutricional com Bruna Flores.",
    images: [siteConfig.ogImagePath],
  },
};

const DETAILS = [
  {
    icon: <ClipboardList className="h-5 w-5" />,
    title: "Pré-consulta inicial",
    step: "1",
    description:
      "Tudo começa com um formulário detalhado sobre você. Histórico de saúde, rotina alimentar, hábitos, objetivos e muito mais. Quanto mais você compartilha, mais personalizado será o atendimento.",
    detail:
      "O formulário leva cerca de 10 minutos e pode ser preenchido no celular. As respostas ficam guardadas com segurança e são acessadas apenas pela nutricionista.",
  },
  {
    icon: <SearchCheck className="h-5 w-5" />,
    title: "Análise individualizada",
    step: "2",
    description:
      "Com base nas suas respostas, a Bruna analisa seu momento antes mesmo da consulta. Isso significa que o atendimento começa com um olhar já personalizado para a sua realidade.",
    detail:
      "Nenhum plano é igual ao outro. A análise considera saúde, rotina, preferências, restrições, objetivos e tudo o que foi compartilhado.",
  },
  {
    icon: <Sprout className="h-5 w-5" />,
    title: "Atendimento personalizado",
    step: "3",
    description:
      "Na consulta, o plano alimentar é construído junto com você — respeitando o que é possível, o que você gosta e o que faz sentido para a sua vida. Sem listas de proibições.",
    detail:
      "O plano inclui orientações práticas, sugestões de cardápio, estratégias de suplementação quando necessário e materiais de apoio.",
  },
  {
    icon: <ChartNoAxesCombined className="h-5 w-5" />,
    title: "Acompanhamento contínuo",
    step: "4",
    description:
      "O processo não termina com a primeira consulta. Os retornos são espaços para avaliar o que funcionou, ajustar o que não funcionou e celebrar as conquistas.",
    detail:
      "O acompanhamento pode ser mensal ou conforme a necessidade. Relatórios de evolução, orientações atualizadas e suporte entre as consultas.",
  },
];

const FAQ_ITEMS = [
  {
    q: "O formulário de pré-consulta é obrigatório?",
    a: "Sim. Ele é o ponto de partida de todo o atendimento e garante que a consulta seja aproveitada ao máximo.",
  },
  {
    q: "Atende online ou presencialmente?",
    a: "O atendimento pode acontecer presencialmente em Florianópolis ou online, conforme disponibilidade e necessidade de cada caso.",
  },
  {
    q: "Qual a frequência dos retornos?",
    a: "Em geral, mensais. Mas a frequência é definida conforme a necessidade de cada caso.",
  },
  {
    q: "O plano alimentar considera minhas restrições?",
    a: "Sim. Intolerâncias, alergias, preferências e aversões são sempre consideradas.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export default function ComoFuncionaPage() {
  return (
    <div className="bg-[#FBF7F1] text-[#3A3028]">
      <PublicHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />

      {/* Hero */}
      <section className="brand-texture px-5 pb-20 pt-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="brand-kicker mb-4">Processo</p>
          <h1 className="mb-5 max-w-3xl font-serif text-5xl font-semibold leading-tight text-[#3A3028] sm:text-6xl">
            Um processo claro para um cuidado mais profundo.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-[#75675E]">
            Um processo simples, acolhedor e transparente — do primeiro contato
            ao acompanhamento contínuo.
          </p>
        </div>
      </section>

      {/* Steps overview */}
      <section className="bg-[#FFFDFC] px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-[1.5rem] border border-[#EDE1D6] bg-[#FBF7F1] p-7 sm:p-9">
          <StepCard
            number="1"
            title="Você preenche a pré-consulta"
            description="Um formulário detalhado para a Bruna entender quem você é antes do primeiro encontro."
          />
          <StepCard
            number="2"
            title="A Bruna analisa seu momento"
            description="Cada resposta é lida com atenção para que o atendimento já comece personalizado."
          />
          <StepCard
            number="3"
            title="O atendimento é personalizado"
            description="Plano alimentar, estratégias e orientações criadas para a sua vida real."
          />
          <StepCard
            number="4"
            title="O acompanhamento continua"
            description="Retornos, ajustes e suporte contínuo para que as mudanças sejam duradouras."
            last
          />
        </div>
      </section>

      {/* Detalhe de cada etapa */}
      <section className="bg-[#FBF7F1] px-5 py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12">
            <SectionTitle
              kicker="Cada etapa em detalhe"
              title="Entenda o processo completo"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {DETAILS.map((d) => (
              <div key={d.step} className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-7 shadow-[0_18px_55px_rgba(58,48,40,0.07)]">
                <div className="flex items-start gap-4 mb-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7F9A74] text-sm font-bold text-white">
                    {d.step}
                  </div>
                  <div>
                    <div className="mb-2 text-[#607A56]">{d.icon}</div>
                    <h3 className="font-serif text-xl font-semibold text-[#3A3028]">
                      {d.title}
                    </h3>
                  </div>
                </div>
                <p className="text-[#3A3028] text-sm leading-relaxed mb-3">
                  {d.description}
                </p>
                <p className="border-t border-[#EDE1D6] pt-3 text-xs leading-relaxed text-[#8D7B6B]">
                  {d.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ curto */}
      <section className="bg-[#FFFDFC] px-5 py-20 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-10">
            <SectionTitle kicker="Dúvidas" title="Perguntas frequentes" />
          </div>
          <div className="space-y-5">
            {FAQ_ITEMS.map((item) => (
              <div key={item.q} className="border-b border-[#EDE1D6] pb-5">
                <p className="font-medium text-[#3A3028] mb-2">{item.q}</p>
                <p className="text-sm text-[#75675E] leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#EAF0E4] px-5 py-20 lg:px-8">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-serif text-3xl font-semibold text-[#3A3028] mb-4 leading-tight">
            Pronta para começar?
          </h2>
          <p className="text-[#607066] mb-8 leading-relaxed">
            Preencha o formulário de pré-consulta e dê o primeiro passo rumo a
            uma alimentação que respeita você.
          </p>
          <Link
            href="/formulario"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#7F9A74] px-8 py-4 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[0_14px_30px_rgba(127,154,116,0.2)] transition hover:bg-[#607A56]"
          >
            Preencher pré-consulta
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
