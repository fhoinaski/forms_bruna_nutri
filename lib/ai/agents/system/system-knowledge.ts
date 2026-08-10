import { guideCategories } from "@/lib/help/guide-content";

/**
 * Serializa o guia completo (a mesma fonte usada pela Central de Ajuda e
 * pelos popups de ajuda) em texto compacto para ancorar as respostas do
 * assistente de chat — evita que a IA invente telas ou passos que nao
 * existem no sistema. Metade estatica do "copiloto do sistema" — a metade
 * dinamica (dados reais) e lib/ai/agents/system/system-overview-agent.ts.
 */
export function buildSystemUsageKnowledgeBase(): string {
  const sections = guideCategories
    .map((category) => {
      const sectionLines = category.sections
        .map((section) => {
          const summary = section.summary ? ` — ${section.summary}` : "";
          const steps = section.steps?.length
            ? section.steps.map((step, index) => `    ${index + 1}. ${step}`).join("\n")
            : "";
          return [`  - ${section.title}${summary}`, steps].filter(Boolean).join("\n");
        })
        .join("\n");
      return `## ${category.title}\n${category.description}\n${sectionLines}`;
    })
    .join("\n\n");

  return `BASE DE CONHECIMENTO DO SISTEMA — use isto como unica fonte de verdade sobre telas, menus e passos. Nao mencione tela, botao ou funcionalidade que nao esteja aqui:\n\n${sections}`;
}

export const SUGGESTED_CHAT_PROMPTS: string[] = [
  "Como crio um plano alimentar para um paciente?",
  "Como aplico um protocolo padrão a um paciente?",
  "Como funciona o autoagendamento pelo portal do paciente?",
  "Como gero o código de acesso ao portal?",
  "Como configuro a disponibilidade de horários para consulta?",
  "Como funciona a sugestão de refeição por IA no plano alimentar?",
  "Como atendo uma solicitação de privacidade (LGPD)?",
  "Como ativo a autenticação em duas etapas (MFA)?",
];
