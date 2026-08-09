export const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://brunanutri.com.br";

export const siteConfig = {
  name: "Bruna Flores Nutri",
  professionalName: "Bruna Flores",
  profession: "Nutricionista",
  professionalRegistration: "CRN 1014683",
  privacyContactEmail: "contato@brunanutri.com.br",
  controllerDocument: "CPF 048.695.649-04 - Fernando Hoinaski",
  controllerAddress: "Endereço profissional a confirmar",
  specialty: "Nutrição materno-infantil",
  city: "Florianópolis",
  state: "Santa Catarina",
  stateCode: "SC",
  country: "Brasil",
  language: "pt-BR",
  locale: "pt_BR",
  url: SITE_URL,
  logoPath: "/brand/bruna-flores-nutri-logo.webp",
  symbolPath: "/brand/bruna-flores-nutri-simbolo.webp",
  ogImagePath: "/bruna-hero-family.png",
  phoneDisplay: "(48) 99136-3266",
  phoneHref: "tel:+5548991363266",
  telephone: "+5548991363266",
  whatsappUrl:
    "https://wa.me/5548991363266?text=Ol%C3%A1%2C%20Bruna%21%20Encontrei%20seu%20site%20e%20gostaria%20de%20saber%20mais%20sobre%20o%20atendimento%20nutricional.",
  homeTitle: "Bruna Flores | Nutricionista em Florianópolis e Online",
  homeDescription:
    "Nutricionista em Florianópolis com atendimento presencial e online para adultos, gestantes, mães e crianças. Acompanhamento nutricional individualizado para diferentes fases da vida.",
  description:
    "Atendimento nutricional em Florianópolis e online para adultos, gestantes, mães, bebês e crianças, com escuta clínica e orientação possível para a rotina.",
  editorialDisclaimer:
    "Conteúdo educativo sobre nutrição e alimentação. Não substitui consulta individual, diagnóstico ou prescrição profissional.",
} as const;

export const PROFESSIONAL_PROFILE = {
  brandName: siteConfig.name,
  professionalName: siteConfig.professionalName,
  specialty: siteConfig.specialty,
  audience: "adultos, gestantes, mães, bebês, crianças e famílias",
  country: siteConfig.country,
  language: siteConfig.language,
  description: siteConfig.description,
  editorialDisclaimer: siteConfig.editorialDisclaimer,
};

export const TOPIC_KEYWORDS = [
  "nutricionista em Florianópolis",
  "nutricionista online",
  "atendimento nutricional em Florianópolis",
  "acompanhamento nutricional",
  "alimentação saudável",
  "reeducação alimentar",
  "nutrição na gestação",
  "nutricionista infantil",
  "introdução alimentar",
  "seletividade alimentar",
  "nutrição materno-infantil",
  "Bruna Flores Nutri",
];

export const EDITORIAL_PILLARS = [
  "Conteúdo educativo separado de orientação individualizada",
  "Linguagem acolhedora, sem culpa, terrorismo nutricional ou promessa rápida",
  "Revisão humana antes da publicação de qualquer conteúdo gerado com apoio de IA",
  "Temas organizados para busca: alimentação saudável, acompanhamento nutricional, gestação, introdução alimentar, seletividade alimentar, nutrição infantil e rotina familiar",
];
