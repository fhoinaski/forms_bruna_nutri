import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { SectionTitle } from "@/components/public/SectionTitle";

export const metadata: Metadata = {
  title: "Serviços | Bruna Flores Nutri",
  description:
    "Conheça as especialidades de atendimento: introdução alimentar, seletividade, TEA, gestação, alimentação infantil e saúde intestinal.",
};

const SERVICES = [
  {
    icon: "🌱",
    title: "Introdução Alimentar",
    subtitle: "Para bebês a partir de 6 meses",
    description:
      "A introdução alimentar é um dos momentos mais importantes e desafiadores da vida de uma família. O atendimento inclui orientações sobre textura, progressão dos alimentos, sinais de prontidão do bebê, como lidar com recusas e como tornar as refeições um momento prazeroso. A abordagem é baseada em evidências, respeitando o ritmo e as preferências do bebê.",
  },
  {
    icon: "🍽️",
    title: "Seletividade Alimentar",
    subtitle: "Para crianças com repertório alimentar restrito",
    description:
      "Muitas crianças apresentam seletividade por textura, cor, cheiro ou sabor. O atendimento envolve avaliação detalhada do perfil sensorial, estratégias práticas para ampliar o repertório alimentar sem pressão e orientações para a família sobre como lidar com as recusas no dia a dia.",
  },
  {
    icon: "💛",
    title: "Nutrição para TEA",
    subtitle: "Atendimento especializado para crianças no espectro autista",
    description:
      "Crianças com TEA frequentemente apresentam desafios sensoriais relacionados à alimentação. O atendimento é individualizado, considerando hipersensibilidades, restrições alimentares, uso de suplementos quando necessário e orientações para a família sobre como tornar as refeições mais tranquilas.",
  },
  {
    icon: "🤰",
    title: "Gestação e Pós-parto",
    subtitle: "Nutrição materna em cada fase",
    description:
      "Durante a gestação, as necessidades nutricionais mudam e cada fase pede atenção especial. No pós-parto, a recuperação do corpo e a amamentação também demandam cuidados específicos. O atendimento inclui plano alimentar individualizado, orientações sobre suplementação e manejo de enjoos, ânsias e outros desconfortos.",
  },
  {
    icon: "👶",
    title: "Alimentação Infantil",
    subtitle: "Para crianças de 2 a 12 anos",
    description:
      "Acompanhamento nutricional para crianças em crescimento, com foco em promover uma relação saudável com a comida desde cedo. Inclui avaliação do crescimento, adequação de nutrientes para cada faixa etária e orientações práticas para o preparo de refeições.",
  },
  {
    icon: "🦠",
    title: "Saúde Intestinal Infantil",
    subtitle: "Microbiota e bem-estar digestivo",
    description:
      "Constipação, diarreias frequentes, cólicas e desconforto abdominal são queixas comuns em crianças. O atendimento aborda a modulação da microbiota intestinal, identificação de possíveis intolerâncias e estratégias alimentares para promover equilíbrio e bem-estar digestivo.",
  },
];

export default function ServicosPage() {
  return (
    <div className="bg-[#FAF7F2] text-[#3A2B1F]">
      <PublicHeader />

      {/* Hero interno */}
      <section className="pt-28 pb-16 px-5 lg:px-8 bg-gradient-to-b from-[#EAD8C2]/50 to-[#FAF7F2]">
        <div className="max-w-6xl mx-auto">
          <p className="brand-kicker mb-4">Especialidades</p>
          <h1 className="font-serif text-4xl sm:text-5xl font-semibold text-[#3A2B1F] max-w-2xl leading-tight mb-5">
            Áreas de atuação
          </h1>
          <p className="text-[#8C6E52] text-lg leading-relaxed max-w-xl">
            Cada fase da vida materno-infantil tem suas necessidades. Todas são
            cuidadas com atenção, evidência e afeto.
          </p>
        </div>
      </section>

      {/* Serviços */}
      <section className="py-16 px-5 lg:px-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {SERVICES.map((s, i) => (
            <div
              key={s.title}
              className="brand-card p-8 grid md:grid-cols-[auto_1fr] gap-6 items-start"
            >
              <div className="w-14 h-14 bg-[#EAD8C2]/60 rounded-2xl flex items-center justify-center text-3xl shrink-0">
                {s.icon}
              </div>
              <div>
                <p className="brand-kicker mb-1">{`0${i + 1}`}</p>
                <h2 className="font-serif text-2xl font-semibold text-[#B47F6A] mb-1">
                  {s.title}
                </h2>
                <p className="text-xs text-[#A8927D] italic mb-4">{s.subtitle}</p>
                <p className="text-[#8C6E52] leading-relaxed text-sm">{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-5 lg:px-8 bg-[#EAD8C2]/40">
        <div className="max-w-xl mx-auto text-center">
          <SectionTitle
            title="Pronta para dar o primeiro passo?"
            subtitle="Preencha o formulário de pré-consulta e inicie sua jornada com um atendimento que respeita você."
            center
          />
          <Link href="/formulario" className="brand-btn-primary mt-8 inline-flex px-8 py-3.5">
            Preencher pré-consulta
          </Link>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
