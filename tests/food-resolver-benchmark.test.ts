import { describe, it, vi, expect } from "vitest";
vi.mock("@/lib/d1/client", () => ({ d1Query: vi.fn().mockResolvedValue([]), d1Execute: vi.fn(), d1Batch: vi.fn().mockResolvedValue([]) }));
import { resolveFoodCandidate } from "@/lib/nutrition/food-resolver";
import { normalizeFoodText } from "@/lib/nutrition/food-terminology";

/**
 * Benchmark de qualidade do Food Resolver (Food Terminology & Catalog
 * Coverage V1, seção 10) — 200+ nomes comuns de alimentos em português,
 * cobrindo cereais, feijões, carnes, peixes, ovos, laticínios, frutas,
 * verduras, legumes, gorduras, bebidas, castanhas e produtos comuns, com
 * variação de fraseado (com/sem qualificador, plural, preparo). Roda
 * offline (TACO/COMPLEMENTARY estáticos, sem D1/USDA/CUSTOM via rede —
 * resultado é um PISO de cobertura, não o total real do sistema em
 * produção, que também tem USDA/CUSTOM/preferência profissional).
 *
 * Métrica crítica (seção 10): WRONG_RESOLUTION deve ficar ≈0. Além da
 * garantia ESTRUTURAL do resolver (rank 3/4 só aceita candidato único que
 * contém TODOS os tokens da query como substring — nunca "escolhe" entre
 * alimentos de verdade diferentes; ver testes negativos em
 * tests/food-resolver-v2.test.ts e tests/food-terminology-negative.test.ts),
 * este benchmark também roda uma checagem automática: todo RESOLVED precisa
 * conter o primeiro token significativo da query no nome técnico resolvido
 * — um resultado "certo" nunca perde o substantivo principal do que foi
 * pedido.
 */
const FOOD_NAMES = [
  // Café da manhã / produtos comuns
  "pão francês", "pão de forma", "pão integral", "manteiga", "margarina", "queijo minas",
  "queijo prato", "presunto", "café com leite", "leite integral", "leite desnatado",
  "leite semidesnatado", "achocolatado", "cereal matinal", "aveia em flocos", "mel",
  "geleia de morango", "suco de laranja", "suco de uva", "vitamina de banana",
  "torrada", "bolacha água e sal", "requeijão cremoso", "manteiga de amendoim",
  // Frutas
  "banana", "banana prata", "banana nanica", "maçã", "maçã fuji", "laranja", "laranja pêra",
  "morango", "uva", "uva itália", "abacaxi", "manga", "manga tommy", "melancia", "melão",
  "mamão", "mamão papaia", "mamão formosa", "pera", "pêssego", "kiwi", "abacate", "goiaba",
  "caju", "maracujá", "limão", "tangerina", "ameixa", "figo", "jaca", "graviola", "carambola",
  "amora", "framboesa", "mirtilo", "coco", "coco ralado", "romã",
  // Carboidratos / cereais
  "arroz", "arroz branco", "arroz integral", "arroz parboilizado", "macarrão", "macarrão integral",
  "batata", "batata inglesa", "batata doce", "batata baroa", "mandioca", "mandioca cozida",
  "aipim", "polenta", "farofa", "farinha de mandioca", "farinha de trigo", "farinha de rosca",
  "cuscuz", "quinoa", "milho", "pipoca", "tapioca", "aveia", "centeio", "cevada",
  // Feijões / leguminosas
  "feijão", "feijão preto", "feijão carioca", "feijão fradinho", "feijão branco",
  "lentilha", "grão de bico", "ervilha", "ervilha seca", "soja", "vagem",
  // Carnes
  "frango", "peito de frango", "coxa de frango", "sobrecoxa de frango", "asa de frango",
  "carne bovina", "carne moída", "picanha", "alcatra", "patinho", "filé mignon", "costela",
  "linguiça", "salsicha", "bacon", "presunto cozido", "mortadela", "carne de porco",
  "lombo suíno", "pernil", "cordeiro", "carne de sol", "carne seca",
  // Peixes / frutos do mar
  "peixe", "salmão", "atum", "sardinha", "camarão", "bacalhau", "polvo", "lula", "merluza",
  "pescada", "tilápia",
  // Ovos
  "ovo", "ovo cozido", "ovo frito", "omelete", "clara de ovo", "gema de ovo", "ovo de codorna",
  // Vegetais / verduras / legumes
  "alface", "alface americana", "alface crespa", "tomate", "cenoura", "beterraba", "abobrinha",
  "chuchu", "brócolis", "couve-flor", "couve", "espinafre", "repolho", "pepino", "berinjela",
  "pimentão", "cebola", "alho", "quiabo", "rúcula", "agrião", "acelga", "abóbora",
  "jiló", "maxixe", "nabo", "rabanete", "aspargo", "palmito", "cogumelo", "champignon",
  // Laticínios
  "iogurte", "iogurte natural", "iogurte grego", "iogurte desnatado", "requeijão", "queijo cottage",
  "queijo mussarela", "queijo parmesão", "cream cheese", "ricota", "queijo coalho",
  "leite fermentado", "leite condensado", "creme de leite", "nata",
  // Gorduras / temperos
  "azeite", "azeite de oliva", "óleo de soja", "óleo de coco", "vinagre", "sal",
  "pimenta do reino", "orégano", "salsa", "cebolinha", "manjericão", "louro", "cominho",
  "páprica", "gengibre", "mostarda", "maionese", "ketchup",
  // Castanhas / oleaginosas
  "castanha", "castanha do pará", "castanha de caju", "amendoim", "amêndoa", "nozes",
  "pistache", "passas", "avelã", "macadâmia", "semente de girassol", "semente de chia",
  "linhaça",
  // Doces / snacks
  "chocolate", "chocolate amargo", "biscoito", "biscoito de água e sal", "bolacha maisena",
  "granola", "paçoca", "pé de moleça", "goiabada", "doce de leite",
  // Bebidas
  "água de coco", "chá", "chá verde", "chá mate", "refrigerante", "cerveja", "vinho tinto",
  "suco de maçã", "suco de abacaxi", "água tônica", "café",
  // Sobremesas / massas / pratos comuns
  "pudim", "gelatina", "sorvete", "torta de limão", "bolo de chocolate", "pão de queijo",
  "empada", "coxinha", "pastel", "lasanha", "pizza", "risoto", "sopa de legumes",
  "salada de frutas", "vitamina de frutas",
];

function tokenizeSimple(text: string): string[] {
  return normalizeFoodText(text).split(" ").filter(Boolean);
}

describe(`Food Resolver — benchmark de ${FOOD_NAMES.length} nomes comuns (piso offline, sem USDA/CUSTOM/preferência profissional)`, () => {
  it(`matriz de ${FOOD_NAMES.length} nomes: mede RESOLVED_CORRECT/AMBIGUOUS/NOT_FOUND/WRONG_RESOLUTION`, async () => {
    expect(FOOD_NAMES.length).toBeGreaterThanOrEqual(200);

    const counts = { RESOLVED_CORRECT: 0, AMBIGUOUS: 0, NOT_FOUND: 0, WRONG_RESOLUTION: 0, OTHER: 0 };
    const resolvedRows: string[] = [];
    const wrongRows: string[] = [];
    const notFoundNames: string[] = [];

    for (const name of FOOD_NAMES) {
      const resolution = await resolveFoodCandidate(name, []);
      if (resolution.status === "RESOLVED") {
        const firstToken = tokenizeSimple(name)[0];
        const resolvedTextNormalized = normalizeFoodText(resolution.name ?? "");
        const headNounPresent = !firstToken || resolvedTextNormalized.includes(firstToken);
        if (headNounPresent) {
          counts.RESOLVED_CORRECT += 1;
          resolvedRows.push(`${name} -> ${resolution.name}`);
        } else {
          counts.WRONG_RESOLUTION += 1;
          wrongRows.push(`${name} -> ${resolution.name}`);
        }
      } else if (resolution.status === "AMBIGUOUS") counts.AMBIGUOUS += 1;
      else if (resolution.status === "NOT_FOUND") {
        counts.NOT_FOUND += 1;
        notFoundNames.push(name);
      } else counts.OTHER += 1;
    }

    console.log(`\n=== Benchmark Food Resolver — ${FOOD_NAMES.length} nomes (offline) ===`);
    console.log(`RESOLVED_CORRECT: ${counts.RESOLVED_CORRECT} (${Math.round((counts.RESOLVED_CORRECT / FOOD_NAMES.length) * 100)}%)`);
    console.log(`AMBIGUOUS: ${counts.AMBIGUOUS} (${Math.round((counts.AMBIGUOUS / FOOD_NAMES.length) * 100)}%)`);
    console.log(`NOT_FOUND: ${counts.NOT_FOUND} (${Math.round((counts.NOT_FOUND / FOOD_NAMES.length) * 100)}%)`);
    console.log(`WRONG_RESOLUTION: ${counts.WRONG_RESOLUTION}`);
    console.log(`OTHER (CLINICAL_*): ${counts.OTHER}`);
    // Relatório de gaps (seção 7 do pedido) — nomes que ainda não resolvem
    // offline, candidatos a cadastro CUSTOM/COMPLEMENTARY ou dependentes de
    // USDA via rede (não cadastrados automaticamente aqui).
    console.log(`\n=== Gaps (NOT_FOUND offline, candidatos a CUSTOM/COMPLEMENTARY ou USDA) ===`);
    notFoundNames.forEach((name) => console.log(`  - ${name}`));

    // WRONG_RESOLUTION ≈ 0 é garantido ESTRUTURALMENTE pelo resolver (rank
    // 3/4 só aceita candidato único que contém TODOS os tokens da query) —
    // este benchmark também mede automaticamente (checagem de substantivo
    // principal) para pegar qualquer regressão futura sem depender só da
    // leitura manual da lista.
    expect(counts.WRONG_RESOLUTION).toBe(0);
    expect(counts.RESOLVED_CORRECT).toBeGreaterThan(0);
    expect(counts.RESOLVED_CORRECT + counts.AMBIGUOUS + counts.NOT_FOUND + counts.WRONG_RESOLUTION + counts.OTHER).toBe(FOOD_NAMES.length);
  });
});
