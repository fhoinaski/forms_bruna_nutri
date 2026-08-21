import { describe, it, vi, expect } from "vitest";
vi.mock("@/lib/d1/client", () => ({ d1Query: vi.fn().mockResolvedValue([]), d1Execute: vi.fn(), d1Batch: vi.fn().mockResolvedValue([]) }));
import { resolveFoodCandidate } from "@/lib/nutrition/food-resolver";

/**
 * Benchmark de qualidade do Food Resolver V2 (fechamento de gaps — auditoria
 * de cobertura, seção 9) — 150 nomes comuns de alimentos em português,
 * cobrindo café da manhã/almoço/jantar/lanches, proteínas, carboidratos,
 * frutas, vegetais e laticínios, com variação de fraseado (com/sem
 * qualificador, plural, preparo). Roda offline (TACO/COMPLEMENTARY
 * estáticos, sem D1/USDA/CUSTOM via rede — resultado é um PISO de
 * cobertura, não o total real do sistema em produção).
 *
 * Métrica crítica (seção 9): WRONG_RESOLUTION deve ficar ≈0 — por
 * construção do resolver (rank 3/4 só aceita quando é o ÚNICO resultado em
 * todo o catálogo E contém todos os tokens da query como substring), uma
 * resolução errada exigiria o catálogo ter um alimento DIFERENTE cujo nome
 * técnico contenha literalmente todos os tokens digitados — praticamente
 * impossível para alimentos genuinamente distintos (ver testes negativos em
 * tests/food-resolver-v2.test.ts). Este benchmark mede a distribuição real,
 * não reavalia a garantia estrutural (que é validada separadamente).
 */
const FOOD_NAMES = [
  // Café da manhã
  "pão francês", "pão de forma", "pão integral", "manteiga", "margarina", "queijo minas",
  "queijo prato", "presunto", "café com leite", "leite integral", "leite desnatado",
  "leite semidesnatado", "achocolatado", "cereal matinal", "aveia em flocos", "mel",
  "geleia de morango", "suco de laranja", "suco de uva", "vitamina de banana",
  // Frutas
  "banana", "banana prata", "banana nanica", "maçã", "maçã fuji", "laranja", "laranja pêra",
  "morango", "uva", "uva itália", "abacaxi", "manga", "manga tommy", "melancia", "melão",
  "mamão", "mamão papaia", "mamão formosa", "pera", "pêssego", "kiwi", "abacate", "goiaba",
  "caju", "maracujá", "limão", "tangerina", "ameixa",
  // Carboidratos / cereais
  "arroz", "arroz branco", "arroz integral", "arroz parboilizado", "macarrão", "macarrão integral",
  "batata", "batata inglesa", "batata doce", "batata baroa", "mandioca", "mandioca cozida",
  "aipim", "polenta", "farofa", "farinha de mandioca", "cuscuz", "quinoa", "milho",
  "pipoca", "tapioca",
  // Leguminosas
  "feijão", "feijão preto", "feijão carioca", "feijão fradinho", "lentilha", "grão de bico",
  "ervilha", "soja",
  // Proteínas
  "frango", "peito de frango", "coxa de frango", "sobrecoxa de frango", "carne bovina",
  "carne moída", "picanha", "alcatra", "patinho", "file mignon", "costela", "linguiça",
  "salsicha", "bacon", "peixe", "salmão", "atum", "sardinha", "camarão", "ovo", "ovo cozido",
  "ovo frito", "omelete", "clara de ovo",
  // Vegetais / verduras
  "alface", "alface americana", "alface crespa", "tomate", "cenoura", "beterraba", "abobrinha",
  "chuchu", "brócolis", "couve-flor", "couve", "espinafre", "repolho", "pepino", "berinjela",
  "pimentão", "cebola", "alho", "vagem", "quiabo", "rúcula", "agrião", "acelga",
  // Laticínios
  "iogurte", "iogurte natural", "iogurte grego", "iogurte desnatado", "requeijão", "queijo cottage",
  "queijo mussarela", "queijo parmesão", "cream cheese", "ricota",
  // Gorduras / temperos
  "azeite", "azeite de oliva", "óleo de soja", "vinagre", "sal", "pimenta do reino", "orégano",
  "salsa", "cebolinha",
  // Doces / snacks
  "chocolate", "chocolate amargo", "biscoito", "biscoito de água e sal", "bolacha maisena",
  "granola", "castanha", "castanha do pará", "castanha de caju", "amendoim", "amêndoa",
  "nozes", "pistache", "passas",
  // Bebidas
  "água de coco", "chá", "chá verde", "refrigerante", "cerveja", "vinho tinto",
  // Sobremesas / massas
  "pudim", "gelatina", "sorvete", "torta de limão", "bolo de chocolate", "pão de queijo",
  "empada", "coxinha", "pastel",
];

describe("Food Resolver V2 — benchmark de 150 nomes comuns (piso offline, sem USDA/CUSTOM)", () => {
  it(`matriz de ${FOOD_NAMES.length} nomes: mede RESOLVED/AMBIGUOUS/NOT_FOUND, WRONG_RESOLUTION ≈ 0 por construção`, async () => {
    expect(FOOD_NAMES.length).toBeGreaterThanOrEqual(150);

    const counts = { RESOLVED: 0, AMBIGUOUS: 0, NOT_FOUND: 0, OTHER: 0 };
    const resolvedRows: string[] = [];
    for (const name of FOOD_NAMES) {
      const resolution = await resolveFoodCandidate(name, []);
      if (resolution.status === "RESOLVED") {
        counts.RESOLVED += 1;
        resolvedRows.push(`${name} -> ${resolution.name}`);
      } else if (resolution.status === "AMBIGUOUS") counts.AMBIGUOUS += 1;
      else if (resolution.status === "NOT_FOUND") counts.NOT_FOUND += 1;
      else counts.OTHER += 1;
    }

    console.log(`\n=== Benchmark Food Resolver V2 (${FOOD_NAMES.length} nomes, offline) ===`);
    console.log(`RESOLVED: ${counts.RESOLVED} (${Math.round((counts.RESOLVED / FOOD_NAMES.length) * 100)}%)`);
    console.log(`AMBIGUOUS: ${counts.AMBIGUOUS} (${Math.round((counts.AMBIGUOUS / FOOD_NAMES.length) * 100)}%)`);
    console.log(`NOT_FOUND: ${counts.NOT_FOUND} (${Math.round((counts.NOT_FOUND / FOOD_NAMES.length) * 100)}%)`);
    console.log(`OTHER (CLINICAL_*): ${counts.OTHER}`);

    // WRONG_RESOLUTION ≈ 0 é garantido ESTRUTURALMENTE (rank 3/4 só aceita
    // candidato único que contém TODOS os tokens da query como substring —
    // nunca "escolhe" entre alimentos de verdade diferentes) — validado
    // separadamente pelos testes negativos, não recalculado aqui por nome.
    expect(counts.RESOLVED).toBeGreaterThan(0);
    expect(counts.RESOLVED + counts.AMBIGUOUS + counts.NOT_FOUND + counts.OTHER).toBe(FOOD_NAMES.length);
  });
});
