import type { Metadata } from "next";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PrivacyRequestForm } from "./PrivacyRequestForm";

export const metadata: Metadata = { title: "Política de Privacidade", description: "Como a Bruna Flores Nutri coleta, utiliza, protege e atende direitos relacionados a dados pessoais e informações de saúde.", alternates: { canonical: "/privacidade" } };

const sections = [
  ["Quais dados são tratados", "Dados de identificação e contato, respostas da pré-consulta, informações nutricionais e de saúde compartilhadas durante o acompanhamento, agenda, histórico de atendimento, documentos clínicos e registros financeiros necessários."],
  ["Para que são utilizados", "Para responder ao contato, preparar e realizar o atendimento nutricional, registrar a evolução, organizar consultas e pagamentos, cumprir obrigações profissionais e legais, manter a segurança do serviço e exercer direitos."],
  ["Base e cuidado reforçado", "Informações de saúde são dados pessoais sensíveis. O tratamento ocorre conforme as hipóteses aplicáveis da LGPD, inclusive consentimento quando necessário, tutela da saúde por profissional da área e cumprimento de obrigações legais ou regulatórias."],
  ["Compartilhamento", "Os dados não são vendidos. O compartilhamento é limitado a fornecedores essenciais de hospedagem, armazenamento, comunicação ou suporte, sujeitos a deveres de segurança, e a autoridades quando houver obrigação legal."],
  ["Retenção e descarte", "Os registros são mantidos apenas pelo período necessário ao atendimento e às obrigações profissionais, legais e de defesa de direitos. Encerrados esses prazos, os dados podem ser eliminados ou anonimizados de forma segura."],
  ["Crianças e adolescentes", "Quando o atendimento envolver criança ou adolescente, o tratamento é realizado no seu melhor interesse e com participação do responsável legal, observando proteção reforçada e coleta limitada ao necessário."],
  ["Segurança", "São adotados controle de acesso, autenticação em dois fatores, registros de auditoria, limitação de tentativas, backups protegidos e procedimentos de resposta a incidentes. As medidas são revistas conforme o risco."],
  ["Seus direitos", "Você pode solicitar confirmação do tratamento, acesso, correção, informação sobre compartilhamento, portabilidade quando aplicável, revogação do consentimento e eliminação ou anonimização, respeitadas as hipóteses legais de conservação."],
];

export default function PrivacyPage() {
  return <main className="min-h-screen bg-[#FBF7F1] text-[#3A3028]"><PublicHeader />
    <section className="border-b border-[#EDE1D6] bg-[#FFFDFC] px-5 py-16 lg:px-8"><div className="mx-auto max-w-5xl"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF0E4] text-[#607A56]"><ShieldCheck className="h-6 w-6" /></div><p className="brand-kicker mb-4">Privacidade e confiança</p><h1 className="max-w-3xl font-serif text-5xl font-semibold leading-tight md:text-6xl">Seus dados fazem parte do cuidado.</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-[#75675E]">Esta política explica, em linguagem direta, como as informações são usadas e protegidas. Versão vigente: 4 de agosto de 2026.</p></div></section>
    <section className="px-5 py-14 lg:px-8"><div className="mx-auto grid max-w-5xl gap-x-12 gap-y-10 md:grid-cols-2">{sections.map(([title, body]) => <article key={title}><h2 className="font-serif text-2xl font-semibold">{title}</h2><p className="mt-3 text-sm leading-7 text-[#75675E]">{body}</p></article>)}</div></section>
    <section id="direitos" className="border-y border-[#EDE1D6] bg-[#FFFDFC] px-5 py-14 lg:px-8"><div className="mx-auto max-w-3xl"><div className="mb-6 flex items-center gap-3"><LockKeyhole className="h-6 w-6 text-[#607A56]" /><h2 className="font-serif text-3xl font-semibold">Solicite seus direitos</h2></div><p className="mb-8 text-sm leading-7 text-[#75675E]">Para proteger você, nenhuma exclusão ou entrega de dados é realizada antes da confirmação segura da identidade. Solicitações são avaliadas conforme a LGPD e as obrigações de guarda aplicáveis.</p><PrivacyRequestForm /></div></section>
    <section className="px-5 py-10 lg:px-8"><div className="mx-auto max-w-5xl text-xs leading-6 text-[#8A7B70]">Controladora: Bruna Flores Nutri. Este texto descreve as práticas implementadas no site e deve receber os dados cadastrais profissionais definitivos antes da publicação comercial.</div></section><PublicFooter /></main>;
}
