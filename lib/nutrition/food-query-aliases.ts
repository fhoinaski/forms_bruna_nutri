/**
 * Alias layer explícito e versionado (Food Resolver V2, seção 3 do pedido)
 * — "mesmo alimento, nome diferente", NUNCA "alimento diferente que pode
 * substituir" (isso é o domínio da Substitution Engine, nunca deste
 * arquivo). Cada entrada aqui reescreve uma FRASE de linguagem natural para
 * a forma técnica equivalente ANTES da busca/ranking — nunca aponta
 * direto pra um source+refId fixo (um número TACO pode mudar de dataset;
 * reescrever a query e deixar o resolver real (com toda a checagem de
 * segurança clínica) resolver de novo é mais seguro que hardcodar um id).
 *
 * Critério de inclusão: só entra aqui uma equivalência que qualquer
 * nutricionista brasileira reconheceria como O MESMO alimento, nunca uma
 * escolha nutricional (ex.: "arroz branco" = "arroz tipo 1" sempre foi a
 * mesma coisa em português; "arroz branco" NUNCA vira "arroz integral"
 * aqui — isso seria uma substituição, não um alias).
 */
const FOOD_QUERY_ALIASES: { pattern: RegExp; replacement: string }[] = [
  // "arroz branco" é como a grande maioria das pessoas chama o arroz
  // polido comum — na TACO isso é catalogado como "tipo 1", nunca como
  // "branco". Nunca reescreve "arroz integral" (token diferente, não bate
  // no pattern).
  { pattern: /\barroz\s+branco\b/gi, replacement: "arroz tipo 1" },
];

export function applyFoodQueryAliases(query: string): string {
  let rewritten = query;
  for (const { pattern, replacement } of FOOD_QUERY_ALIASES) {
    rewritten = rewritten.replace(pattern, replacement);
  }
  return rewritten;
}
