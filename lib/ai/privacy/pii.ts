/**
 * Deteccao e redacao de identificadores diretos em texto livre antes de ele
 * ser enviado a um provedor de IA externo. E defesa em profundidade: mesmo
 * com sanitize-context.ts removendo nome/contato conhecidos do banco, um
 * campo de texto livre (resposta de formulario, nota) pode conter um CPF ou
 * telefone digitado pelo proprio paciente.
 */

const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const PHONE_PATTERN = /\b(?:\+?55\s?)?(?:\(?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}\b/g;
const EMAIL_PATTERN = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const CEP_PATTERN = /\b\d{5}-?\d{3}\b/g;

export interface RedactPiiResult {
  text: string;
  redactedCount: number;
}

/**
 * Substitui padroes de CPF, telefone, e-mail e CEP por marcadores neutros.
 * Nao tenta detectar endereco em texto livre (muito ambiguo para regex sem
 * gerar falsos positivos em dados clinicos) — enderecos estruturados devem
 * ser removidos no nivel de sanitize-context.ts, que sabe quais campos sao
 * de contato.
 */
export function redactPii(text: string): RedactPiiResult {
  let redactedCount = 0;
  const text1 = text.replace(CPF_PATTERN, () => { redactedCount++; return "[CPF removido]"; });
  const text2 = text1.replace(EMAIL_PATTERN, () => { redactedCount++; return "[e-mail removido]"; });
  const text3 = text2.replace(CEP_PATTERN, () => { redactedCount++; return "[CEP removido]"; });
  const text4 = text3.replace(PHONE_PATTERN, (match) => {
    // Evita falso positivo em numeros que sao claramente medidas clinicas
    // (ex.: "70.5 kg", datas ja tratadas por outro campo) — exige pelo
    // menos 8 digitos seguidos ignorando separadores, tipico de telefone BR.
    const digits = match.replace(/\D/g, "");
    if (digits.length < 8) return match;
    redactedCount++;
    return "[telefone removido]";
  });
  return { text: text4, redactedCount };
}
