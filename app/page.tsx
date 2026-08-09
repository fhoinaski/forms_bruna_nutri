import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Baby,
  CheckCircle2,
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
import { safeJsonLd } from "@/lib/seo/json-ld";
import { siteConfig } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: {
    absolute: siteConfig.homeTitle,
  },
  description: siteConfig.homeDescription,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: siteConfig.homeTitle,
    description: siteConfig.homeDescription,
    images: [
      {
        url: siteConfig.ogImagePath,
        width: 1792,
        height: 1024,
        alt: "Bruna Flores Nutri - atendimento nutricional em Florianópolis e online",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.homeTitle,
    description: siteConfig.homeDescription,
    images: [siteConfig.ogImagePath],
  },
};

const baseUrl = siteConfig.url;

const SERVICES = [
  {
    icon: <Salad className="h-6 w-6" />,
    title: "Nutrição para adultos",
    description:
      "Acompanhamento nutricional para quem busca mais energia, organização alimentar, qualidade de vida e escolhas possíveis dentro da rotina.",
    accent: "sage" as const,
  },
  {
    icon: <Utensils className="h-6 w-6" />,
    title: "Reeducação alimentar",
    description:
      "Para construir hábitos sustentáveis, sem terrorismo nutricional, cardápios genéricos ou promessas rápidas que não cabem na vida real.",
    accent: "rose" as const,
  },
  {
    icon: <Baby className="h-6 w-6" />,
    title: "Gestação e pós-parto",
    description:
      "Orientações para atravessar gestação, amamentação e pós-parto com segurança, acolhimento e ajustes ao momento da mãe e do bebê.",
    accent: "rose" as const,
  },
  {
    icon: <Sprout className="h-6 w-6" />,
    title: "Introdução alimentar",
    description:
      "Apoio para famílias que querem começar com segurança, entendendo sinais de prontidão, texturas, rotina e dúvidas comuns dessa fase.",
    accent: "sage" as const,
  },
  {
    icon: <Puzzle className="h-6 w-6" />,
    title: "Seletividade alimentar",
    description:
      "Quando a criança aceita poucos alimentos, recusa novidades ou a mesa virou tensão. O cuidado busca ampliar repertório sem pressão.",
    accent: "fig" as const,
  },
  {
    icon: <Microscope className="h-6 w-6" />,
    title: "Saúde intestinal",
    description:
      "Avaliação de sinais digestivos, hábitos e alimentação quando constipação, gases, dor ou desconfortos atrapalham o bem-estar.",
    accent: "fig" as const,
  },
];

const ABOUT_POINTS = [
  "Nutricionista em Florianópolis, com atendimento presencial e online",
  "Atuação ampla em alimentação saudável, adultos e acompanhamento familiar",
  "Diferencial em nutrição materno-infantil, gestação e infância",
  "Planos construídos a partir da rotina real, sem promessas ou radicalismos",
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

const FAMILY_MOMENTS = [
  {
    title: "Tenho medo de errar na introdução alimentar",
    text: "Você recebe orientação para entender sinais de prontidão, textura, rotina e segurança sem transformar esse início em pressão.",
  },
  {
    title: "Meu filho come sempre as mesmas coisas",
    text: "A seletividade é acolhida com estratégia, paciência e metas graduais, respeitando o tempo da criança e da família.",
  },
  {
    title: "A alimentação virou um ponto de tensão em casa",
    text: "O objetivo é devolver leveza às refeições, com combinados possíveis e menos culpa para quem cuida.",
  },
  {
    title: "Quero cuidar melhor, mas minha rotina é corrida",
    text: "O plano considera compras, preparo, escola, trabalho, sono e rede de apoio para funcionar fora do papel.",
  },
];

const TRUST_POINTS = [
  ["Método clínico", "Anamnese, rotina, sinais de saúde, contexto familiar e objetivos são organizados antes da conduta."],
  ["Sem promessas rápidas", "O cuidado evita terrorismo nutricional, culpa e planos genéricos que não cabem na rotina."],
  ["Conteúdo revisado", "Materiais e artigos educativos são apoio de clareza, não prescrição individual."],
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${baseUrl}/#website`,
      name: siteConfig.name,
      url: baseUrl,
      inLanguage: siteConfig.language,
      description: siteConfig.description,
      publisher: {
        "@id": `${baseUrl}/#service`,
      },
    },
    {
      "@type": "WebPage",
      "@id": `${baseUrl}/#webpage`,
      url: `${baseUrl}/`,
      name: siteConfig.homeTitle,
      description: siteConfig.homeDescription,
      isPartOf: {
        "@id": `${baseUrl}/#website`,
      },
      about: {
        "@id": `${baseUrl}/#service`,
      },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: `${baseUrl}${siteConfig.ogImagePath}`,
        width: 1792,
        height: 1024,
      },
      inLanguage: siteConfig.language,
    },
    {
      "@type": "ProfessionalService",
      "@id": `${baseUrl}/#service`,
      name: siteConfig.name,
      url: baseUrl,
      logo: `${baseUrl}${siteConfig.logoPath}`,
      image: `${baseUrl}${siteConfig.ogImagePath}`,
      telephone: siteConfig.telephone,
      description: siteConfig.description,
      areaServed: [
        {
          "@type": "City",
          name: siteConfig.city,
          address: {
            "@type": "PostalAddress",
            addressLocality: siteConfig.city,
            addressRegion: siteConfig.stateCode,
            addressCountry: "BR",
          },
        },
        {
          "@type": "Country",
          name: siteConfig.country,
        },
      ],
      availableLanguage: "Portuguese",
      contactPoint: {
        "@type": "ContactPoint",
        telephone: siteConfig.telephone,
        contactType: "customer service",
        areaServed: "BR",
        availableLanguage: "Portuguese",
      },
      knowsAbout: [
        "Nutrição para adultos",
        "Acompanhamento nutricional",
        "Alimentação saudável",
        "Reeducação alimentar",
        "Nutrição na gestação",
        "Nutrição infantil",
        "Introdução alimentar",
        "Seletividade alimentar",
      ],
      makesOffer: SERVICES.map((service) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: service.title,
          description: service.description,
          serviceType: service.title,
          areaServed: [siteConfig.city, siteConfig.country],
        },
      })),
      potentialAction: {
        "@type": "ReserveAction",
        name: "Preencher pré-consulta",
        target: `${baseUrl}/formulario`,
      },
      slogan: "Nutrição para uma vida mais leve e saudável",
      publishingPrinciples: `${baseUrl}/blog`,
    },
    {
      "@type": "Person",
      "@id": `${baseUrl}/#bruna-flores`,
      name: siteConfig.professionalName,
      jobTitle: siteConfig.profession,
      telephone: siteConfig.telephone,
      worksFor: {
        "@id": `${baseUrl}/#service`,
      },
      workLocation: {
        "@type": "City",
        name: `${siteConfig.city}, ${siteConfig.stateCode}`,
      },
      knowsAbout: [
        "Nutrição",
        "Alimentação saudável",
        "Acompanhamento nutricional",
        "Reeducação alimentar",
        "Nutrição na gestação",
        "Nutrição materno-infantil",
        "Nutrição infantil",
        "Introdução alimentar",
        "Seletividade alimentar",
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#FBF7F1] text-[#3A3028]">
      <PublicHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }}
      />

      <section className="relative min-h-[94vh] overflow-hidden">
        <Image
          src="/bruna-hero-family.png"
          alt="Família preparando alimentos frescos em uma mesa clara e acolhedora"
          fill
          priority
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(251,247,241,0.98)_0%,rgba(251,247,241,0.88)_36%,rgba(251,247,241,0.42)_64%,rgba(251,247,241,0.1)_100%)]" />
        <div className="absolute inset-0 brand-texture opacity-50" />

        <div className="relative z-10 mx-auto flex min-h-[94vh] max-w-7xl flex-col justify-end px-5 pb-10 pt-28 lg:px-8 lg:pb-14">
          <div className="max-w-3xl">
            <p className="brand-kicker mb-5">Nutricionista em Florianópolis e online</p>
            <h1 data-testid="home-hero-title" className="max-w-4xl font-serif text-5xl font-semibold leading-[0.95] text-[#3A3028] sm:text-6xl lg:text-7xl">
              Nutrição para uma vida mais
              <span className="brand-script-line relative z-10 italic text-[#7F9A74]">
                {" "}
                leve
              </span>{" "}
              e saudável.
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-[#75675E] sm:text-lg">
              Atendimento nutricional em Florianópolis e online para adultos,
              gestantes, mães e crianças, respeitando sua rotina, necessidades
              e objetivos.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/formulario" className="brand-btn-primary px-7 py-4">
                Preencher pré-consulta
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#como-funciona"
                className="inline-flex items-center justify-center rounded-full border border-[#3A3028]/15 bg-white/55 px-7 py-4 text-xs font-semibold uppercase tracking-[0.12em] text-[#3A3028] backdrop-blur transition hover:bg-white"
              >
                Entender o processo
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

      <section id="sobre" className="bg-[#FBF7F1] px-5 py-24 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="relative overflow-hidden rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-8 shadow-[0_22px_58px_rgba(58,48,40,0.07)]">
            <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-[#EAF0E4]" />
            <Image
              src="/brand/bruna-flores-nutri-simbolo.webp"
              alt=""
              width={96}
              height={112}
              sizes="96px"
              className="relative z-10 h-28 w-24 object-contain"
            />
            <p className="brand-kicker relative z-10 mt-8">Sobre a Bruna</p>
            <h2 className="relative z-10 mt-3 font-serif text-4xl font-semibold leading-tight text-[#3A3028] sm:text-5xl">
              Um cuidado técnico, mas com conversa de gente.
            </h2>
            <p className="relative z-10 mt-5 text-base leading-8 text-[#75675E]">
              Bruna Flores é nutricionista em Florianópolis, com atendimento
              presencial e online. Ela acompanha adultos e famílias em diferentes
              fases da vida, com um olhar especial para gestação, infância,
              introdução alimentar e seletividade alimentar.
            </p>
          </div>

          <div>
            <SectionTitle
              kicker="Confiança"
              title="Clareza para decidir, acolhimento para continuar."
              subtitle="O acompanhamento não promete uma rotina perfeita. Ele organiza prioridades e orienta escolhas mais tranquilas, com técnica, respeito e consistência."
            />
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {ABOUT_POINTS.map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-3 rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] p-4"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#7F9A74]" />
                  <p className="text-sm leading-6 text-[#75675E]">{point}</p>
                </div>
              ))}
            </div>
            <Link
              href="/como-funciona"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#607A56] transition hover:text-[#8C5F50]"
            >
              Ver como o atendimento acontece
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[#FFFDFC] px-5 py-20 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="brand-kicker mb-3">Autoridade com cuidado</p>
            <h2 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028] sm:text-5xl">
              Informação profissional, decisão compartilhada e orientação possível.
            </h2>
            <p className="mt-5 text-base leading-8 text-[#75675E]">
              O site foi pensado para acolher pessoas e famílias que chegam com dúvidas reais.
              O conteúdo ajuda a entender caminhos, mas a conduta nutricional nasce
              da avaliação individual, da fase de vida e da rotina da casa.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {TRUST_POINTS.map(([title, text]) => (
              <div key={title} className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FBF7F1] p-5">
                <p className="font-serif text-xl font-semibold text-[#3A3028]">{title}</p>
                <p className="mt-2 text-sm leading-6 text-[#75675E]">{text}</p>
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

      <section className="bg-[#FBF7F1] px-5 py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-3xl">
            <SectionTitle
              kicker="Quando procurar"
              title="Se a alimentação virou dúvida, você não precisa resolver tudo sozinha."
              subtitle="Muitas famílias chegam com insegurança, cansaço ou excesso de informação. O atendimento ajuda a transformar esse cenário em próximos passos possíveis."
            />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {FAMILY_MOMENTS.map((item) => (
              <div
                key={item.title}
                className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]"
              >
                <h3 className="font-serif text-2xl font-semibold leading-tight text-[#3A3028]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[#75675E]">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="servicos" className="bg-[#FBF7F1] px-5 py-24 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <SectionTitle
              kicker="Especialidades"
              title="Cuidado nutricional para diferentes fases da vida."
              subtitle="Adultos, gestantes, mães e crianças recebem orientação individualizada, considerando rotina, contexto, vínculo e segurança."
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
            Quero contar meu momento
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-5 text-sm text-[#607066]">
            Prefere falar primeiro?{" "}
            <a
              href={siteConfig.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#607A56] underline-offset-4 hover:underline"
              aria-label="Falar com Bruna Flores pelo WhatsApp"
            >
              Chame a Bruna no WhatsApp
            </a>
            .
          </p>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
