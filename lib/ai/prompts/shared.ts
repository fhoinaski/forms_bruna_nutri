/**
 * Frase padrao usada por toda tool de "proposta" para deixar claro ao LLM
 * que ela nunca aplica a mudanca sozinha. Antes desta migracao, cada um dos
 * 9 modulos de proposta reescrevia essa mesma frase a mao, com pequenas
 * variacoes. Uma unica fonte aqui facilita manter a redacao consistente e
 * evita que uma futura tool "esqueca" a instrucao.
 */
export const PROPOSAL_DISCLAIMER =
  "A ferramenta apenas registra uma PROPOSTA: a interface mostra os dados para a nutricionista revisar, editar e confirmar antes de qualquer coisa ser salva de verdade. Nunca finalize a acao sozinha.";

/** Variante para acoes classificadas como "clinical" — reforça que a confirmação é sempre obrigatória, sem exceção. */
export const CLINICAL_PROPOSAL_DISCLAIMER =
  "A ferramenta apenas registra uma PROPOSTA. Esta e uma acao CLINICA: a confirmacao humana antes de salvar e sempre obrigatoria, sem excecao — mesmo que o pedido pareca simples ou urgente.";
