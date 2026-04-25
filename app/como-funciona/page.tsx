import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { SectionTitle } from "@/components/public/SectionTitle";
import { StepCard } from "@/components/public/StepCard";

export const metadata: Metadata = {
  title: "Como funciona | Bruna Flores Nutri",
  description:
    "Entenda como funciona o atendimento nutricional: pré-consulta, análise personalizada, plano alimentar e acompanhamento contínuo.",
};

const DETAILS = [
  {
    icon: "📋",
    title: "Pré-consulta online",
    step: "1",
    description:
      "Tudo começa com um formulário detalhado sobre você. Histórico de saúde, rotina alimentar, hábitos, objetivos e muito mais. Quanto mais você compartilha, mais personalizado será o atendimento.",
    detail:
      "O formulário leva cerca de 10 minutos e pode ser preenchido no celular. As respostas ficam guardadas com segurança e são acessadas apenas pela nutricionista.",
  },
  {
    icon: "🔍",
    title: "Análise individualizada",
    step: "2",
    description:
      "Com base nas suas respostas, a Bruna analisa seu momento antes mesmo da consulta. Isso significa que o atendimento começa com um olhar já personalizado para a sua realidade.",
    detail:
      "Nenhum plano é igual ao outro. A análise considera saúde, rotina, preferências, restrições, objetivos e tudo o que foi compartilhado.",
  },
  {
    icon: "🌿",
    title: "Atendimento personalizado",
    step: "3",
    description:
      "Na consulta, o plano alimentar é construído junto com você — respeitando o que é possível, o que você gosta e o que faz sentido para a sua vida. Sem listas de proibições.",
    detail:
      "O plano inclui orientações práticas, sugestões de cardápio, estratégias de suplementação quando necessário e materiais de apoio.",
  },
  {
    icon: "📈",
    title: "Acompanhamento contínuo",
    step: "4",
    description:
      "O processo não termina com a primeira consulta. Os retornos são espaços para avaliar o que funcionou, ajustar o que não funcionou e celebrar as conquistas.",
    detail:
      "O acompanhamento pode ser mensal ou conforme a necessidade. Relatórios de evolução, orientações atualizadas e suporte entre as consultas.",
  },
];

export default function ComoFuncionaPage() {
  return (
    <div className="bg-[#FAF7F2] text-[#3A2B1F]">
      <PublicHeader />

      {/* Hero */}
      <section className="pt-28 pb-16 px-5 lg:px-8 bg-gradient-to-b from-[#EAD8C2]/50 to-[#FAF7F2]">
        <div className="max-w-6xl mx-auto">
          <p className="brand-kicker mb-4">Processo</p>
          <h1 className="font-serif text-4xl sm:text-5xl font-semibold text-[#3A2B1F] max-w-2xl leading-tight mb-5">
            Como funciona o atendimento?
          </h1>
          <p className="text-[#8C6E52] text-lg leading-relaxed max-w-xl">
            Um processo simples, acolhedor e transparente — do primeiro contato
            ao acompanhamento contínuo.
          </p>
        </div>
      </section>

      {/* Steps overview */}
      <section className="py-16 px-5 lg:px-8 bg-white">
        <div className="max-w-3xl mx-auto">
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
      <section className="py-16 px-5 lg:px-8 bg-[#FAF7F2]">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <SectionTitle
              kicker="Cada etapa em detalhe"
              title="Entenda o processo completo"
            />
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {DETAILS.map((d) => (
              <div key={d.step} className="brand-card p-7">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-10 h-10 bg-[#7A9A74] rounded-full flex items-center justify-center text-white font-serif font-bold text-sm shrink-0">
                    {d.step}
                  </div>
                  <div>
                    <p className="text-xl mr-2 inline">{d.icon}</p>
                    <h3 className="font-serif text-xl font-semibold text-[#B47F6A] inline">
                      {d.title}
                    </h3>
                  </div>
                </div>
                <p className="text-[#3A2B1F] text-sm leading-relaxed mb-3">
                  {d.description}
                </p>
                <p className="text-xs text-[#A8927D] leading-relaxed border-t border-[#EAD8C2] pt-3">
                  {d.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ curto */}
      <section className="py-16 px-5 lg:px-8 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="mb-10">
            <SectionTitle kicker="Dúvidas" title="Perguntas frequentes" />
          </div>
          <div className="space-y-5">
            {[
              {
                q: "O formulário de pré-consulta é obrigatório?",
                a: "Sim. Ele é o ponto de partida de todo o atendimento e garante que a consulta seja aproveitada ao máximo.",
              },
              {
                q: "Atende online ou presencialmente?",
                a: "O atendimento é realizado online, o que facilita o acesso independente de onde você mora.",
              },
              {
                q: "Qual a frequência dos retornos?",
                a: "Em geral, mensais. Mas a frequência é definida conforme a necessidade de cada caso.",
              },
              {
                q: "O plano alimentar considera minhas restrições?",
                a: "Absolutamente. Intolerâncias, alergias, preferências e aversões são sempre consideradas.",
              },
            ].map((item) => (
              <div key={item.q} className="border-b border-[#EAD8C2] pb-5">
                <p className="font-medium text-[#3A2B1F] mb-2">{item.q}</p>
                <p className="text-sm text-[#8C6E52] leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-5 lg:px-8 bg-[#7A9A74]">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-serif text-3xl font-semibold text-white mb-4 leading-tight">
            Pronta para começar?
          </h2>
          <p className="text-[#EAD8C2]/90 mb-8 leading-relaxed">
            Preencha o formulário de pré-consulta e dê o primeiro passo rumo a
            uma alimentação que respeita você.
          </p>
          <Link
            href="/formulario"
            className="inline-flex items-center justify-center bg-white text-[#7A9A74] font-semibold text-sm px-8 py-4 rounded-full hover:bg-[#FAF7F2] transition-colors shadow-lg"
          >
            Preencher pré-consulta
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
