import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Baby, Microscope, Puzzle, Salad, Sprout, Utensils } from "lucide-react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { siteConfig } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Serviços de nutrição em Florianópolis e online",
  description:
    "Atendimento nutricional presencial em Florianópolis e online para adultos, gestantes, mães e crianças. Conheça acompanhamento nutricional, reeducação alimentar, gestação, introdução alimentar e seletividade.",
  alternates: { canonical: "/servicos" },
  openGraph: {
    type: "website",
    url: "/servicos",
    title: "Serviços de nutrição em Florianópolis e online",
    description:
      "Atendimento nutricional para adultos, gestantes, mães e crianças, com acompanhamento individualizado em Florianópolis e online.",
    images: [siteConfig.ogImagePath],
  },
  twitter: {
    card: "summary_large_image",
    title: "Serviços de nutrição em Florianópolis e online",
    description:
      "Atendimento nutricional para adultos, gestantes, mães e crianças, em Florianópolis e online.",
    images: [siteConfig.ogImagePath],
  },
};

const SERVICES = [
  {
    icon: <Salad className="h-7 w-7" />,
    title: "Nutrição para adultos",
    subtitle: "Alimentação saudável, rotina e qualidade de vida",
    description:
      "Acompanhamento nutricional para adultos que querem organizar a alimentação, melhorar hábitos, cuidar da saúde e construir uma rotina possível. A orientação considera preferências, exames disponíveis, objetivos, histórico e contexto de vida, sem promessas rápidas ou planos genéricos.",
  },
  {
    icon: <Utensils className="h-7 w-7" />,
    title: "Reeducação alimentar",
    subtitle: "Mudança de hábitos com consistência",
    description:
      "Atendimento para quem busca uma relação mais leve com a comida e precisa transformar informação em prática. O plano trabalha escolhas alimentares, organização das refeições, compras, preparo e ajustes graduais para sustentar mudanças no dia a dia.",
  },
  {
    icon: <Baby className="h-7 w-7" />,
    title: "Gestação e pós-parto",
    subtitle: "Nutrição materna em cada fase",
    description:
      "Durante a gestação, o pós-parto e a amamentação, as necessidades mudam e cada fase pede atenção. O atendimento organiza alimentação, rotina, sintomas, suplementação quando indicada e escolhas possíveis para o momento da mãe e do bebê.",
  },
  {
    icon: <Sprout className="h-7 w-7" />,
    title: "Introdução alimentar",
    subtitle: "Para bebês a partir dos sinais de prontidão",
    description:
      "Apoio para famílias que querem iniciar a alimentação complementar com segurança. O atendimento aborda sinais de prontidão, texturas, progressão, dúvidas frequentes, rotina da casa e estratégias para tornar as refeições mais tranquilas.",
  },
  {
    icon: <Puzzle className="h-7 w-7" />,
    title: "Seletividade alimentar",
    subtitle: "Para crianças com repertório alimentar restrito",
    description:
      "Quando a criança aceita poucos alimentos ou recusa novidades, a condução precisa de paciência e estratégia. O atendimento busca compreender rotina, preferências, sensibilidade, ambiente alimentar e caminhos graduais para ampliar repertório sem pressão.",
  },
  {
    icon: <Microscope className="h-7 w-7" />,
    title: "Saúde intestinal",
    subtitle: "Hábitos, sinais digestivos e bem-estar",
    description:
      "Constipação, gases, desconfortos e alterações intestinais podem ter relação com rotina, hidratação, fibras, padrão alimentar e contexto individual. A avaliação conecta sinais digestivos, hábitos e alimentação para orientar condutas seguras.",
  },
];

export default function ServicosPage() {
  return (
    <div className="bg-[#FBF7F1] text-[#3A3028]">
      <PublicHeader />

      {/* Hero interno */}
      <section className="brand-texture px-5 pb-20 pt-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="brand-kicker mb-4">Especialidades</p>
          <h1 className="mb-5 max-w-3xl font-serif text-5xl font-semibold leading-tight text-[#3A3028] sm:text-6xl">
            Áreas de atuação com profundidade e contexto.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-[#75675E]">
            Atendimento nutricional em Florianópolis e online para adultos,
            gestantes, mães e crianças, com orientação individualizada e contexto.
          </p>
        </div>
      </section>

      {/* Serviços */}
      <section className="px-5 py-16 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {SERVICES.map((s, i) => (
            <div
              key={s.title}
              className="grid items-start gap-6 rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-7 shadow-[0_18px_55px_rgba(58,48,40,0.07)] md:grid-cols-[auto_1fr_auto]"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EAF0E4] text-[#607A56]">
                {s.icon}
              </div>
              <div>
                <p className="brand-kicker mb-1">{`0${i + 1}`}</p>
                <h2 className="mb-1 font-serif text-2xl font-semibold text-[#3A3028]">
                  {s.title}
                </h2>
                <p className="mb-4 text-xs italic text-[#8D7B6B]">{s.subtitle}</p>
                <p className="text-sm leading-relaxed text-[#75675E]">{s.description}</p>
              </div>
              <Link
                href="/formulario"
                className="inline-flex items-center gap-2 rounded-full border border-[#7F9A74]/35 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4] md:self-center"
              >
                Começar
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#EAF0E4] px-5 py-20 text-[#3A3028] lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="brand-kicker mb-4 text-[#607A56]">Pré-consulta</p>
          <h2 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028]">
            Pronta para dar o primeiro passo?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#607066]">
            Preencha o formulário de pré-consulta e inicie sua jornada com um
            atendimento que respeita você.
          </p>
          <Link href="/formulario" className="mt-8 inline-flex rounded-full bg-[#7F9A74] px-8 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[0_14px_30px_rgba(127,154,116,0.2)] transition hover:bg-[#607A56]">
            Preencher pré-consulta
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
