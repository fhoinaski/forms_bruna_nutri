import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Baby, Microscope, Puzzle, Salad, Sprout, Utensils } from "lucide-react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";

export const metadata: Metadata = {
  title: "Serviços | Bruna Flores Nutri",
  description:
    "Conheça as especialidades de atendimento: introdução alimentar, seletividade, TEA, gestação, alimentação infantil e saúde intestinal.",
};

const SERVICES = [
  {
    icon: <Sprout className="h-7 w-7" />,
    title: "Introdução Alimentar",
    subtitle: "Para bebês a partir de 6 meses",
    description:
      "A introdução alimentar é um dos momentos mais importantes e desafiadores da vida de uma família. O atendimento inclui orientações sobre textura, progressão dos alimentos, sinais de prontidão do bebê, como lidar com recusas e como tornar as refeições um momento prazeroso. A abordagem é baseada em evidências, respeitando o ritmo e as preferências do bebê.",
  },
  {
    icon: <Utensils className="h-7 w-7" />,
    title: "Seletividade Alimentar",
    subtitle: "Para crianças com repertório alimentar restrito",
    description:
      "Muitas crianças apresentam seletividade por textura, cor, cheiro ou sabor. O atendimento envolve avaliação detalhada do perfil sensorial, estratégias práticas para ampliar o repertório alimentar sem pressão e orientações para a família sobre como lidar com as recusas no dia a dia.",
  },
  {
    icon: <Puzzle className="h-7 w-7" />,
    title: "Nutrição para TEA",
    subtitle: "Atendimento especializado para crianças no espectro autista",
    description:
      "Crianças com TEA frequentemente apresentam desafios sensoriais relacionados à alimentação. O atendimento é individualizado, considerando hipersensibilidades, restrições alimentares, uso de suplementos quando necessário e orientações para a família sobre como tornar as refeições mais tranquilas.",
  },
  {
    icon: <Baby className="h-7 w-7" />,
    title: "Gestação e Pós-parto",
    subtitle: "Nutrição materna em cada fase",
    description:
      "Durante a gestação, as necessidades nutricionais mudam e cada fase pede atenção especial. No pós-parto, a recuperação do corpo e a amamentação também demandam cuidados específicos. O atendimento inclui plano alimentar individualizado, orientações sobre suplementação e manejo de enjoos, ânsias e outros desconfortos.",
  },
  {
    icon: <Salad className="h-7 w-7" />,
    title: "Alimentação Infantil",
    subtitle: "Para crianças de 2 a 12 anos",
    description:
      "Acompanhamento nutricional para crianças em crescimento, com foco em promover uma relação saudável com a comida desde cedo. Inclui avaliação do crescimento, adequação de nutrientes para cada faixa etária e orientações práticas para o preparo de refeições.",
  },
  {
    icon: <Microscope className="h-7 w-7" />,
    title: "Saúde Intestinal Infantil",
    subtitle: "Microbiota e bem-estar digestivo",
    description:
      "Constipação, diarreias frequentes, cólicas e desconforto abdominal são queixas comuns em crianças. O atendimento aborda a modulação da microbiota intestinal, identificação de possíveis intolerâncias e estratégias alimentares para promover equilíbrio e bem-estar digestivo.",
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
            Cada fase da vida materno-infantil tem suas necessidades. Todas são
            cuidadas com atenção, evidência e afeto.
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
