/**
 * Normalizacao de texto (remove acentos, minuscula, trim) usada por todo
 * lib/nutrition/* para comparar nomes de alimento/unidade. Extraida para um
 * arquivo proprio (antes vivia em macros.ts) para evitar import circular
 * entre macros.ts e quantity-resolution.ts, que agora tambem precisa dela —
 * macros.ts continua reexportando `normalize` para nao quebrar nenhum
 * import existente.
 */
export function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
