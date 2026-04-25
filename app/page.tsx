import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { SectionTitle } from "@/components/public/SectionTitle";
import { ServiceCard } from "@/components/public/ServiceCard";
import { StepCard } from "@/components/public/StepCard";

export const metadata: Metadata = {
  title: "Bruna Flores Nutri | Nutrição Materno-Infantil",
  description:
    "Atendimento nutricional personalizado para gestantes, mães, bebês e crianças. Com acolhimento, estratégia e leveza.",
};

const SERVICES = [
  {
    icon: "🌱",
    title: "Introdução alimentar",
    description:
      "Orientação segura e gentil para apresentar alimentos sólidos ao bebê, respeitando seu desenvolvimento.",
  },
  {
    icon: "🍽️",
    title: "Seletividade alimentar",
    description:
      "Apoio para famílias com crianças seletivas, com estratégias práticas para ampliar o repertório alimentar.",
  },
  {
    icon: "💛",
    title: "TEA",
    description:
      "Cuidado nutricional especializado para crianças com Transtorno do Espectro Autista, respeitando suas particularidades.",
  },
  {
    icon: "🤰",
    title: "Gestação e pós-parto",
    description:
      "Nutrição individualizada para gestantes e puérperas, apoiando saúde materna e do bebê em cada fase.",
  },
  {
    icon: "👶",
    title: "Alimentação infantil",
    description:
      "Acompanhamento nutricional para crianças de todas as idades, promovendo relação saudável com a comida.",
  },
  {
    icon: "🦠",
    title: "Saúde intestinal infantil",
    description:
      "Abordagem funcional para intestino, microbiota e bem-estar digestivo de bebês e crianças.",
  },
];

const TRUST = [
  {
    icon: "🌿",
    title: "Atendimento acolhedor",
    text: "Um espaço seguro para compartilhar sua rotina, desafios e expectativas sem julgamentos.",
  },
  {
    icon: "📋",
    title: "Estratégias possíveis",
    text: "Planos alimentares que cabem na sua vida real — sem radicalismos, sem culpa.",
  },
  {
    icon: "🔍",
    title: "Olhar individualizado",
    text: "Cada atendimento começa entendendo você: sua rotina, seu momento, seu filho.",
  },
  {
    icon: "📚",
    title: "Orientações organizadas",
    text: "Materiais, receitas e orientações entregues de forma clara e prática.",
  },
];

export default function HomePage() {
  return (
    <div className="bg-[#FAF7F2] text-[#3A2B1F]">
      <PublicHeader />

      {/* ── Hero ── */}
      <section className="relative min-h-[92vh] flex flex-col justify-center overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#EAD8C2]/60 via-[#FAF7F2] to-[#F4C9C6]/20 pointer-events-none" />

        {/* Botanical decoration */}
        <div className="absolute right-0 top-0 bottom-0 w-1/2 pointer-events-none hidden lg:block opacity-25">
          <svg viewBox="0 0 500 700" fill="none" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
            <ellipse cx="350" cy="350" rx="300" ry="340" stroke="#7A9A74" strokeWidth="1" />
            <ellipse cx="350" cy="350" rx="220" ry="250" stroke="#B47F6A" strokeWidth="0.5" />
            <ellipse cx="350" cy="350" rx="140" ry="160" stroke="#F4C9C6" strokeWidth="0.5" />
            <path d="M200 100 Q400 200 350 450 Q300 600 150 650" stroke="#7A9A74" strokeWidth="1.5" fill="none"/>
            <path d="M220 120 Q420 220 370 470" stroke="#EAD8C2" strokeWidth="1" fill="none"/>
            <circle cx="350" cy="100" r="6" fill="#F4C9C6" opacity="0.6"/>
            <circle cx="200" cy="400" r="4" fill="#7A9A74" opacity="0.4"/>
            <circle cx="450" cy="550" r="5" fill="#F4C9C6" opacity="0.5"/>
          </svg>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-5 lg:px-8 pt-24 pb-16">
          <div className="max-w-xl">
            <p className="brand-kicker mb-5">Nutrição Materno-Infantil</p>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold text-[#3A2B1F] leading-[1.1] mb-6">
              Nutrição com{" "}
              <em className="italic text-[#7A9A74] not-italic font-light">acolhimento</em>
              ,{" "}
              <br className="hidden sm:block" />
              estratégia{" "}
              <em className="font-serif italic text-[#B47F6A]">e leveza</em>
            </h1>

            <p className="text-[#8C6E52] text-base sm:text-lg leading-relaxed mb-10 max-w-lg">
              Atendimento personalizado para gestantes, mães, bebês e crianças,
              respeitando rotina, desenvolvimento e individualidade.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/formulario" className="brand-btn-primary text-sm px-7 py-3.5">
                Preencher pré-consulta
              </Link>
              <Link
                href="#como-funciona"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full border-2 border-[#EAD8C2] text-sm font-medium text-[#8C6E52] hover:border-[#B47F6A] hover:text-[#B47F6A] transition-colors"
              >
                Conhecer o atendimento
              </Link>
            </div>

            <div className="flex flex-wrap gap-6 mt-10 text-xs text-[#A8927D]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#7A9A74] rounded-full" />
                Gestantes e puérperas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#7A9A74] rounded-full" />
                Introdução alimentar
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#7A9A74] rounded-full" />
                Crianças e TEA
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sobre ── */}
      <section id="sobre" className="py-20 px-5 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <SectionTitle
              kicker="Sobre"
              title="Uma nutricionista que acredita na leveza do processo"
            />
            <p className="mt-6 text-[#8C6E52] leading-relaxed">
              A Bruna Flores Nutri nasceu do desejo de oferecer um atendimento
              nutricional que vai além do cardápio. Um espaço onde gestantes, mães
              e crianças são vistas em sua totalidade — rotina, emoção, história.
            </p>
            <p className="mt-4 text-[#8C6E52] leading-relaxed">
              O objetivo é construir junto com você estratégias que sejam possíveis,
              sustentáveis e respeitosas com a sua vida real.
            </p>
          </div>
          <div className="bg-[#FAF7F2] rounded-3xl p-8 border border-[#EAD8C2]">
            <div className="grid grid-cols-2 gap-6">
              {[
                { num: "100%", label: "Atendimento personalizado" },
                { num: "0", label: "Radicalismos ou dietas restritivas" },
                { num: "∞", label: "Acolhimento e escuta ativa" },
                { num: "1", label: "Passo de cada vez" },
              ].map((i) => (
                <div key={i.label} className="text-center">
                  <p className="font-serif text-3xl font-bold text-[#7A9A74]">{i.num}</p>
                  <p className="text-xs text-[#A8927D] mt-1 leading-snug">{i.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Especialidades ── */}
      <section id="servicos" className="py-20 px-5 lg:px-8 bg-[#FAF7F2]">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <SectionTitle
              kicker="Especialidades"
              title="Áreas de atuação"
              subtitle="Cada fase da vida materno-infantil tem suas necessidades. Aqui, todas são cuidadas com atenção e expertise."
            />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SERVICES.map((s) => (
              <ServiceCard key={s.title} {...s} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/servicos"
              className="inline-flex items-center gap-2 text-sm text-[#7A9A74] font-medium border border-[#7A9A74]/40 rounded-full px-6 py-2.5 hover:bg-[#7A9A74]/10 transition-colors"
            >
              Ver todos os serviços
            </Link>
          </div>
        </div>
      </section>

      {/* ── Como funciona ── */}
      <section id="como-funciona" className="py-20 px-5 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <SectionTitle
              kicker="Processo"
              title="Como funciona o atendimento?"
              subtitle="Um processo pensado para ser simples, acolhedor e eficiente."
            />
            <Link
              href="/como-funciona"
              className="inline-flex items-center text-sm text-[#7A9A74] mt-8 font-medium hover:text-[#B47F6A] transition-colors"
            >
              Saiba mais sobre o processo →
            </Link>
          </div>
          <div>
            <StepCard
              number="1"
              title="Você preenche a pré-consulta"
              description="Um formulário detalhado sobre sua rotina, histórico de saúde, hábitos alimentares e objetivos. Leva cerca de 10 minutos."
            />
            <StepCard
              number="2"
              title="A Bruna analisa seu momento"
              description="Com base nas suas respostas, o atendimento já começa com um olhar personalizado antes mesmo da primeira consulta."
            />
            <StepCard
              number="3"
              title="O atendimento é personalizado"
              description="Plano alimentar, orientações e estratégias criadas especialmente para a sua realidade. Sem receitas genéricas."
            />
            <StepCard
              number="4"
              title="O acompanhamento continua"
              description="Retornos periódicos, ajustes no plano e suporte contínuo para que as mudanças sejam sustentáveis a longo prazo."
              last
            />
          </div>
        </div>
      </section>

      {/* ── Confiança ── */}
      <section className="py-20 px-5 lg:px-8 bg-[#FAF7F2]">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 text-center">
            <SectionTitle
              kicker="Por que escolher"
              title="Um atendimento que respeita você"
              center
            />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TRUST.map((t) => (
              <div key={t.title} className="text-center">
                <div className="text-3xl mb-4">{t.icon}</div>
                <h3 className="font-serif font-semibold text-[#3A2B1F] mb-2">{t.title}</h3>
                <p className="text-sm text-[#8C6E52] leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="py-20 px-5 lg:px-8 bg-[#7A9A74] relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <svg viewBox="0 0 800 300" fill="none" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
            <circle cx="700" cy="150" r="200" stroke="white" strokeWidth="1" />
            <circle cx="700" cy="150" r="130" stroke="white" strokeWidth="0.5" />
            <circle cx="100" cy="150" r="100" stroke="white" strokeWidth="0.5" />
          </svg>
        </div>
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <p className="text-[10px] tracking-[0.25em] uppercase text-[#EAD8C2] mb-4 font-semibold">
            Primeiro passo
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-white mb-4 leading-tight">
            Vamos começar com uma{" "}
            <em className="italic font-light">pré-consulta?</em>
          </h2>
          <p className="text-[#EAD8C2]/90 mb-8 text-base leading-relaxed">
            O formulário é gratuito e leva cerca de 10 minutos. Quanto mais você
            compartilhar, mais personalizado será o atendimento.
          </p>
          <Link
            href="/formulario"
            className="inline-flex items-center justify-center gap-2 bg-white text-[#7A9A74] font-semibold text-sm tracking-wide px-8 py-4 rounded-full hover:bg-[#FAF7F2] transition-colors shadow-lg"
          >
            Preencher formulário
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
