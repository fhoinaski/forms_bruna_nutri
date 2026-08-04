import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Baby,
  ClipboardCheck,
  HeartHandshake,
  Microscope,
  Puzzle,
  Salad,
  ShieldCheck,
  Sparkles,
  Sprout,
  Utensils,
} from "lucide-react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { SectionTitle } from "@/components/public/SectionTitle";
import { ServiceCard } from "@/components/public/ServiceCard";
import { StepCard } from "@/components/public/StepCard";

export const metadata: Metadata = {
  title: "Bruna Flores Nutri | Nutrição Materno-Infantil",
  description:
    "Atendimento nutricional materno-infantil com escuta, evidência e planos possíveis para gestantes, mães, bebês e crianças.",
};

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://brunanutri.com.br";

const SERVICES = [
  {
    icon: <Sprout className="h-6 w-6" />,
    title: "Introdução alimentar",
    description:
      "Um início seguro e leve, com textura, sinais de prontidão, rotina e autonomia organizados de forma prática para a família.",
    accent: "sage" as const,
  },
  {
    icon: <Utensils className="h-6 w-6" />,
    title: "Seletividade alimentar",
    description:
      "Estratégias graduais para ampliar repertório, sem pressão na mesa e com respeito ao perfil sensorial da criança.",
    accent: "rose" as const,
  },
  {
    icon: <Puzzle className="h-6 w-6" />,
    title: "TEA",
    description:
      "Cuidado nutricional individualizado para crianças no espectro, considerando sensibilidade, rotina e segurança alimentar.",
    accent: "fig" as const,
  },
  {
    icon: <Baby className="h-6 w-6" />,
    title: "Gestação e pós-parto",
    description:
      "Suporte para cada fase materna, com plano alimentar, suplementação quando necessária e adaptação à vida real.",
    accent: "rose" as const,
  },
  {
    icon: <Salad className="h-6 w-6" />,
    title: "Alimentação infantil",
    description:
      "Acompanhamento do crescimento com foco em vínculo, variedade, nutrientes e uma relação saudável com a comida.",
    accent: "sage" as const,
  },
  {
    icon: <Microscope className="h-6 w-6" />,
    title: "Saúde intestinal",
    description:
      "Olhar funcional para constipação, desconfortos, microbiota e sinais digestivos que impactam o bem-estar infantil.",
    accent: "fig" as const,
  },
];

const SIGNATURES = [
  {
    icon: <HeartHandshake className="h-5 w-5" />,
    title: "Escuta clínica e familiar",
    text: "Antes de qualquer orientação, a consulta considera rotina, histórico, preferências, desafios e a dinâmica da casa.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Orientações seguras",
    text: "As condutas são baseadas em evidências e explicadas com clareza para que a família saiba o que fazer e por quê.",
  },
  {
    icon: <ClipboardCheck className="h-5 w-5" />,
    title: "Plano possível para a rotina",
    text: "O plano respeita tempo, orçamento, preferências e fase da criança, com próximos passos objetivos e sustentáveis.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${baseUrl}/#website`,
      name: "Bruna Flores Nutri",
      url: baseUrl,
      inLanguage: "pt-BR",
      description:
        "Nutrição materno-infantil para gestantes, mães, bebês e crianças.",
      publisher: {
        "@id": `${baseUrl}/#business`,
      },
    },
    {
      "@type": "WebPage",
      "@id": `${baseUrl}/#webpage`,
      url: baseUrl,
      name: "Bruna Flores Nutri | Nutrição Materno-Infantil",
      isPartOf: {
        "@id": `${baseUrl}/#website`,
      },
      about: {
        "@id": `${baseUrl}/#business`,
      },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: `${baseUrl}/bruna-hero-family.png`,
        width: 1792,
        height: 1024,
      },
      inLanguage: "pt-BR",
    },
    {
      "@type": "MedicalBusiness",
      "@id": `${baseUrl}/#business`,
      name: "Bruna Flores Nutri",
      url: baseUrl,
      logo: `${baseUrl}/brand/bruna-flores-nutri-logo.svg`,
      image: `${baseUrl}/bruna-hero-family.png`,
      description:
        "Atendimento nutricional materno-infantil com escuta clínica, evidência e orientações possíveis para a rotina familiar.",
      medicalSpecialty: "https://schema.org/DietNutrition",
      areaServed: {
        "@type": "Country",
        name: "Brasil",
      },
      availableLanguage: "Portuguese",
      knowsAbout: [
        "Nutrição materno-infantil",
        "Introdução alimentar",
        "Seletividade alimentar",
        "Nutrição para TEA",
        "Gestação e pós-parto",
        "Alimentação infantil",
        "Saúde intestinal infantil",
      ],
      makesOffer: SERVICES.map((service) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: service.title,
          description: service.description,
          serviceType: service.title,
          areaServed: "Brasil",
        },
      })),
      potentialAction: {
        "@type": "ReserveAction",
        name: "Preencher pré-consulta",
        target: `${baseUrl}/formulario`,
      },
    },
  ],
};

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#FBF7F1] text-[#3A3028]">
      <PublicHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <section className="relative min-h-[94vh] overflow-hidden">
        <Image
          src="/bruna-hero-family.png"
          alt="Mãe e criança preparando frutas em uma mesa clara e acolhedora"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(251,247,241,0.98)_0%,rgba(251,247,241,0.88)_36%,rgba(251,247,241,0.42)_64%,rgba(251,247,241,0.1)_100%)]" />
        <div className="absolute inset-0 brand-texture opacity-50" />

        <div className="relative z-10 mx-auto flex min-h-[94vh] max-w-7xl flex-col justify-end px-5 pb-10 pt-28 lg:px-8 lg:pb-14">
          <div className="max-w-3xl">
            <p className="brand-kicker mb-5">Nutrição materno-infantil</p>
            <h1 className="max-w-4xl font-serif text-5xl font-semibold leading-[0.95] text-[#3A3028] sm:text-6xl lg:text-7xl">
              Nutrição para famílias que querem
              <span className="brand-script-line relative z-10 italic text-[#7F9A74]">
                {" "}
                leveza
              </span>{" "}
              à mesa.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-[#75675E] sm:text-lg">
              Acompanhamento para gestantes, mães, bebês e crianças, com
              orientação segura, acolhedora e possível para a vida real.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/formulario" className="brand-btn-primary px-7 py-4">
                Iniciar pré-consulta
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#experiencia"
                className="inline-flex items-center justify-center rounded-full border border-[#3A3028]/15 bg-white/55 px-7 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#3A3028] backdrop-blur transition hover:bg-white"
              >
                Ver experiência
              </Link>
            </div>
          </div>

          <div className="mt-14 grid gap-3 sm:grid-cols-3 lg:max-w-4xl">
            {[
              ["Pré-consulta", "a Bruna entende seu contexto antes do encontro"],
              ["Plano possível", "orientações que cabem na rotina da família"],
              ["Acompanhamento", "ajustes com acolhimento, clareza e direção"],
            ].map(([title, text]) => (
              <div key={title} className="brand-glass rounded-2xl p-4">
                <p className="font-serif text-xl font-semibold text-[#3A3028]">
                  {title}
                </p>
                <p className="mt-1 text-xs leading-5 text-[#75675E]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="experiencia" className="relative bg-[#FFFDFC] px-5 py-24 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <SectionTitle
              kicker="Como é o atendimento"
              title="Um acompanhamento que escuta antes de orientar."
              subtitle="A consulta une técnica e acolhimento para transformar dúvidas sobre alimentação em escolhas mais tranquilas, possíveis e seguras no dia a dia."
            />
            <div className="mt-9 space-y-4">
              {SIGNATURES.map((item) => (
                <div key={item.title} className="flex gap-4 rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1]/78 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#7F9A74] text-white">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="font-serif text-xl font-semibold text-[#3A3028]">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-[#75675E]">
                      {item.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -left-8 top-8 hidden h-72 w-72 rounded-full border border-[#E2C7BD]/50 lg:block" />
            <div className="relative overflow-hidden rounded-[1.5rem] border border-[#EDE1D6] bg-[#F6ECE4] p-6 text-[#3A3028] shadow-[0_26px_70px_rgba(58,48,40,0.09)]">
              <div className="flex items-center justify-between border-b border-[#E2D2C5] pb-5">
                <p className="brand-kicker text-[#8C5F50]">O que é observado</p>
                <Sparkles className="h-5 w-5 text-[#7F9A74]" />
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  ["Rotina", "horários, sono, escola, trabalho e rede de apoio"],
                  ["Corpo", "sinais digestivos, crescimento, energia e exames"],
                  ["Mesa", "preferências, recusas, compras e preparo real"],
                  ["Vínculo", "autonomia, acolhimento e segurança emocional"],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-2xl bg-[#FFFDFC]/70 p-5">
                    <p className="font-serif text-2xl font-semibold">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-[#75675E]">{text}</p>
                  </div>
                ))}
              </div>
              <p className="mt-8 max-w-xl text-sm leading-7 text-[#75675E]">
                A pré-consulta organiza as informações essenciais para que a
                consulta seja mais objetiva, personalizada e acolhedora desde o início.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="servicos" className="bg-[#FBF7F1] px-5 py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <SectionTitle
              kicker="Especialidades"
              title="Cuidado para cada fase da família."
              subtitle="Da gestação à alimentação infantil, cada orientação considera desenvolvimento, contexto, vínculo e segurança."
            />
            <Link
              href="/servicos"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-[#7F9A74]/35 px-6 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]"
            >
              Explorar serviços
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((service) => (
              <ServiceCard key={service.title} {...service} />
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="bg-[#FFFDFC] px-5 py-24 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionTitle
              kicker="Processo"
              title="Do primeiro relato às mudanças possíveis."
              subtitle="O processo foi pensado para acolher sua história, organizar prioridades e transformar orientação em rotina."
            />
            <Link
              href="/como-funciona"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#607A56] transition hover:text-[#8C5B70]"
            >
              Ver processo completo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FBF7F1] p-6 sm:p-8">
            <StepCard
              number="01"
              title="Você preenche a pré-consulta"
              description="Um formulário detalhado sobre rotina, saúde, hábitos alimentares, objetivos e desafios atuais."
            />
            <StepCard
              number="02"
              title="A Bruna lê o seu contexto"
              description="As respostas viram um mapa inicial para a consulta ser mais precisa desde o primeiro minuto."
            />
            <StepCard
              number="03"
              title="O plano nasce junto com você"
              description="Condutas, combinações e estratégias são ajustadas para a vida real, não para um cenário ideal."
            />
            <StepCard
              number="04"
              title="O acompanhamento mantém direção"
              description="Retornos ajudam a observar evolução, destravar dificuldades e refinar o plano sem culpa."
              last
            />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#EAF0E4] px-5 py-24 text-[#3A3028] lg:px-8">
        <div className="absolute inset-0 opacity-35 brand-texture" />
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <p className="brand-kicker mb-4 text-[#607A56]">Primeiro passo</p>
          <h2 className="font-serif text-4xl font-semibold leading-tight sm:text-6xl">
            Comece contando o momento da sua família.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-[#607066]">
            O formulário leva cerca de 10 minutos e ajuda a Bruna a preparar um
            atendimento mais próximo, técnico e direcionado para o que vocês vivem hoje.
          </p>
          <Link
            href="/formulario"
            className="mt-9 inline-flex items-center justify-center gap-2 rounded-full bg-[#7F9A74] px-8 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-[0_18px_42px_rgba(127,154,116,0.22)] transition hover:bg-[#607A56]"
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
