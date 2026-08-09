import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Conteudo inicial para acelerar a rotina clinica. Todo modelo e apenas ponto
// de partida e deve ser revisado pela nutricionista antes de virar prescricao.

type TemplateType = "DIETA" | "SUPLEMENTACAO" | "SUBSTITUICAO";
type TargetGroup =
  | "EMAGRECIMENTO"
  | "HIPERTROFIA"
  | "IDOSO"
  | "GESTANTE"
  | "ADULTO_SAUDAVEL"
  | "CRIANCA"
  | "TEA"
  | "SOP"
  | "VEGETARIANO_ESTRITO"
  | "ENDURANCE"
  | "RESISTENCIA_INSULINA";

type Meal = {
  name: string;
  suggested_time?: string;
  notes?: string;
  items: Array<{ food: string; quantity: string; unit: string; notes?: string }>;
};
type Substitution = { base_food: string; option_food: string; quantity?: string; unit?: string; notes?: string };
type Supplement = { name: string; dosage?: string; unit?: string; instructions?: string; notes?: string };
type Seed = {
  id: string;
  type: TemplateType;
  target_group: TargetGroup;
  title: string;
  notes: string;
  meals?: Meal[];
  substitutions?: Substitution[];
  supplements?: Supplement[];
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;

if (!accountId || !databaseId || !apiToken) {
  throw new Error("Configure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID e CLOUDFLARE_D1_API_TOKEN.");
}

async function query(sql: string, params: unknown[] = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const data = await response.json() as { success: boolean; errors?: Array<{ message: string }> };
  if (!response.ok || !data.success) {
    throw new Error(data.errors?.map((item) => item.message).join("; ") || "Falha ao gravar no D1.");
  }
}

function groupLabel(group: TargetGroup) {
  return group.replaceAll("_", " ").toLowerCase();
}

function meal(name: string, items: Meal["items"], notes = "", suggested_time = ""): Meal {
  return { name, suggested_time, notes, items };
}

function commonSubstitutions(): Substitution[] {
  return [
    { base_food: "Arroz cozido", option_food: "Batata inglesa cozida", quantity: "150", unit: "g", notes: "Troca de carboidrato conforme preferencia e rotina." },
    { base_food: "Peito de frango grelhado", option_food: "Ovos cozidos", quantity: "2", unit: "un", notes: "Ajustar por meta proteica individual." },
    { base_food: "Banana", option_food: "Maca", quantity: "1", unit: "un", notes: "Troca de fruta mantendo porcao semelhante." },
    { base_food: "Azeite de oliva", option_food: "Abacate", quantity: "50", unit: "g", notes: "Troca de fonte de gordura." },
  ];
}

const genericMeals: Record<Exclude<TargetGroup, "SOP" | "VEGETARIANO_ESTRITO" | "ENDURANCE" | "RESISTENCIA_INSULINA">, Meal[]> = {
  ADULTO_SAUDAVEL: [
    meal("Cafe da manha", [{ food: "Pao de forma integral", quantity: "50", unit: "g" }, { food: "Ovo de galinha inteiro cozido", quantity: "100", unit: "g" }, { food: "Banana prata", quantity: "80", unit: "g" }]),
    meal("Almoco", [{ food: "Arroz integral cozido", quantity: "120", unit: "g" }, { food: "Feijao carioca cozido", quantity: "100", unit: "g" }, { food: "Peito de frango grelhado", quantity: "120", unit: "g" }, { food: "Brocolis cozido", quantity: "100", unit: "g" }]),
    meal("Jantar", [{ food: "Batata doce cozida", quantity: "150", unit: "g" }, { food: "File de tilapia grelhado", quantity: "130", unit: "g" }, { food: "Abobrinha cozida", quantity: "120", unit: "g" }]),
  ],
  EMAGRECIMENTO: [
    meal("Cafe da manha", [{ food: "Iogurte natural", quantity: "170", unit: "g" }, { food: "Aveia em flocos", quantity: "25", unit: "g" }, { food: "Morango", quantity: "100", unit: "g" }]),
    meal("Almoco", [{ food: "Peito de frango grelhado", quantity: "130", unit: "g" }, { food: "Arroz integral cozido", quantity: "80", unit: "g" }, { food: "Feijao preto cozido", quantity: "70", unit: "g" }, { food: "Salada de folhas verdes", quantity: "120", unit: "g" }]),
    meal("Jantar", [{ food: "Ovo de galinha inteiro cozido", quantity: "100", unit: "g" }, { food: "Brocolis cozido", quantity: "150", unit: "g" }, { food: "Azeite de oliva", quantity: "8", unit: "g" }]),
  ],
  HIPERTROFIA: [
    meal("Cafe da manha", [{ food: "Pao frances", quantity: "100", unit: "g" }, { food: "Ovo de galinha inteiro cozido", quantity: "150", unit: "g" }, { food: "Banana prata", quantity: "100", unit: "g" }]),
    meal("Almoco", [{ food: "Arroz branco cozido", quantity: "180", unit: "g" }, { food: "Feijao carioca cozido", quantity: "120", unit: "g" }, { food: "Patinho moido", quantity: "150", unit: "g" }, { food: "Cenoura cozida", quantity: "100", unit: "g" }]),
    meal("Lanche pos-treino", [{ food: "Whey protein", quantity: "30", unit: "g" }, { food: "Banana prata", quantity: "100", unit: "g" }, { food: "Aveia em flocos", quantity: "40", unit: "g" }]),
  ],
  IDOSO: [
    meal("Cafe da manha", [{ food: "Leite integral", quantity: "200", unit: "ml" }, { food: "Aveia em flocos", quantity: "30", unit: "g" }, { food: "Mamao formosa", quantity: "120", unit: "g" }]),
    meal("Almoco", [{ food: "Arroz branco cozido", quantity: "100", unit: "g" }, { food: "Feijao carioca cozido", quantity: "100", unit: "g" }, { food: "Frango cozido", quantity: "120", unit: "g" }, { food: "Abobora cozida", quantity: "120", unit: "g" }]),
    meal("Jantar", [{ food: "File de tilapia grelhado", quantity: "120", unit: "g" }, { food: "Batata inglesa cozida", quantity: "130", unit: "g" }, { food: "Chuchu cozido", quantity: "120", unit: "g" }]),
  ],
  GESTANTE: [
    meal("Cafe da manha", [{ food: "Pao de forma integral", quantity: "50", unit: "g" }, { food: "Queijo minas frescal", quantity: "40", unit: "g" }, { food: "Laranja", quantity: "120", unit: "g" }]),
    meal("Almoco", [{ food: "Arroz integral cozido", quantity: "120", unit: "g" }, { food: "Feijao preto cozido", quantity: "100", unit: "g" }, { food: "Peito de frango grelhado", quantity: "130", unit: "g" }, { food: "Couve refogada", quantity: "80", unit: "g" }]),
    meal("Jantar", [{ food: "Macarrao cozido", quantity: "120", unit: "g" }, { food: "Carne bovina cozida", quantity: "120", unit: "g" }, { food: "Brocolis cozido", quantity: "100", unit: "g" }]),
  ],
  CRIANCA: [
    meal("Cafe da manha", [{ food: "Pao de forma", quantity: "30", unit: "g" }, { food: "Ovo de galinha inteiro cozido", quantity: "50", unit: "g" }, { food: "Banana prata", quantity: "60", unit: "g" }]),
    meal("Almoco", [{ food: "Arroz branco cozido", quantity: "70", unit: "g" }, { food: "Feijao carioca cozido", quantity: "60", unit: "g" }, { food: "Frango cozido", quantity: "70", unit: "g" }, { food: "Cenoura cozida", quantity: "50", unit: "g" }]),
    meal("Lanche", [{ food: "Iogurte natural", quantity: "120", unit: "g" }, { food: "Maca", quantity: "80", unit: "g" }]),
  ],
  TEA: [
    meal("Cafe da manha", [{ food: "Pao de forma", quantity: "40", unit: "g" }, { food: "Queijo minas frescal", quantity: "30", unit: "g" }, { food: "Banana prata", quantity: "60", unit: "g" }], "Manter previsibilidade visual e separar alimentos se houver aversao a mistura."),
    meal("Almoco", [{ food: "Arroz branco cozido", quantity: "80", unit: "g" }, { food: "Frango cozido", quantity: "80", unit: "g" }, { food: "Cenoura cozida", quantity: "40", unit: "g" }], "Apresentar novidade em porcao minima, sem pressao."),
    meal("Lanche", [{ food: "Iogurte natural", quantity: "120", unit: "g" }, { food: "Granola", quantity: "15", unit: "g" }]),
  ],
};

const specializedMeals: Record<"SOP" | "VEGETARIANO_ESTRITO" | "ENDURANCE" | "RESISTENCIA_INSULINA", Meal[]> = {
  SOP: [
    meal("Cafe da manha", [{ food: "Ovo de galinha inteiro cozido", quantity: "150", unit: "g" }, { food: "Abacate", quantity: "50", unit: "g" }, { food: "Semente de abobora", quantity: "15", unit: "g" }]),
    meal("Almoco", [{ food: "Peito de frango grelhado", quantity: "120", unit: "g" }, { food: "Quinoa cozida", quantity: "100", unit: "g" }, { food: "Brocolis cozido", quantity: "100", unit: "g" }, { food: "Azeite de oliva", quantity: "10", unit: "g" }]),
    meal("Lanche da tarde", [{ food: "Whey protein", quantity: "30", unit: "g" }, { food: "Morango", quantity: "100", unit: "g" }]),
    meal("Jantar", [{ food: "File de salmao assado", quantity: "120", unit: "g" }, { food: "Aspargos refogados", quantity: "100", unit: "g" }, { food: "Semente de girassol", quantity: "10", unit: "g" }]),
  ],
  VEGETARIANO_ESTRITO: [
    meal("Cafe da manha", [{ food: "Tofu", quantity: "150", unit: "g" }, { food: "Pao de forma integral", quantity: "50", unit: "g" }, { food: "Kiwi", quantity: "100", unit: "g" }]),
    meal("Almoco", [{ food: "Lentilha cozida", quantity: "150", unit: "g" }, { food: "Arroz integral cozido", quantity: "100", unit: "g" }, { food: "Proteina texturizada de soja", quantity: "50", unit: "g" }, { food: "Couve refogada", quantity: "100", unit: "g" }]),
    meal("Lanche da tarde", [{ food: "Proteina isolada de ervilha", quantity: "30", unit: "g" }, { food: "Banana prata", quantity: "100", unit: "g" }, { food: "Pasta de amendoim", quantity: "15", unit: "g" }]),
  ],
  ENDURANCE: [
    meal("Pre-treino", [{ food: "Pao frances", quantity: "100", unit: "g" }, { food: "Geleia de fruta", quantity: "40", unit: "g" }, { food: "Suco de uva integral", quantity: "300", unit: "ml" }]),
    meal("Intra-treino", [{ food: "Gel de carboidrato", quantity: "30", unit: "g" }]),
    meal("Pos-treino imediato", [{ food: "Whey protein", quantity: "30", unit: "g" }, { food: "Doce de leite", quantity: "50", unit: "g" }]),
    meal("Almoco", [{ food: "Macarrao cozido", quantity: "300", unit: "g" }, { food: "Patinho moido", quantity: "120", unit: "g" }, { food: "Molho de tomate", quantity: "100", unit: "g" }]),
  ],
  RESISTENCIA_INSULINA: [
    meal("Cafe da manha", [{ food: "Ovo de galinha inteiro cozido", quantity: "150", unit: "g" }, { food: "Abacate", quantity: "50", unit: "g" }, { food: "Farelo de aveia", quantity: "20", unit: "g" }]),
    meal("Almoco", [{ food: "Salada de folhas verdes", quantity: "150", unit: "g" }, { food: "Peito de frango grelhado", quantity: "130", unit: "g" }, { food: "Feijao preto cozido", quantity: "80", unit: "g" }, { food: "Arroz integral cozido", quantity: "60", unit: "g" }]),
    meal("Jantar", [{ food: "File de tilapia grelhado", quantity: "150", unit: "g" }, { food: "Abobrinha cozida", quantity: "150", unit: "g" }, { food: "Azeite de oliva", quantity: "10", unit: "g" }]),
  ],
};

const supplements: Record<TargetGroup, Supplement[]> = {
  ADULTO_SAUDAVEL: [{ name: "Vitamina D", dosage: "conforme exames", instructions: "Avaliar necessidade antes de prescrever." }],
  EMAGRECIMENTO: [{ name: "Proteina complementar", dosage: "conforme meta", instructions: "Usar apenas se a alimentacao nao atingir a meta proteica." }],
  HIPERTROFIA: [{ name: "Creatina monohidratada", dosage: "3-5", unit: "g", instructions: "Uso diario, se nao houver contraindicao." }],
  IDOSO: [{ name: "Vitamina B12", dosage: "conforme exames", instructions: "Avaliar dosagem e sinais clinicos." }],
  GESTANTE: [{ name: "Acido folico", dosage: "conforme prescricao", instructions: "Alinhar com acompanhamento obstetrico." }],
  CRIANCA: [{ name: "Vitamina D", dosage: "conforme idade/exames", instructions: "Individualizar e alinhar com pediatra quando necessario." }],
  TEA: [{ name: "Polivitaminico", dosage: "conforme avaliacao", instructions: "Considerar seletividade alimentar e aceitacao sensorial." }],
  SOP: [{ name: "Mio-inositol", dosage: "2", unit: "g", instructions: "Uso diario conforme avaliacao." }, { name: "Vitamina D3", dosage: "2000", unit: "UI", instructions: "Ajustar conforme exames." }],
  VEGETARIANO_ESTRITO: [{ name: "Vitamina B12", dosage: "500", unit: "mcg", instructions: "Monitorar exames." }, { name: "Creatina monohidratada", dosage: "3-5", unit: "g", instructions: "Uso diario se indicado." }],
  ENDURANCE: [{ name: "Carboidrato esportivo", dosage: "30-60", unit: "g/h", instructions: "Ajustar conforme duracao e tolerancia do treino." }],
  RESISTENCIA_INSULINA: [{ name: "Magnesio", dosage: "conforme avaliacao", instructions: "Avaliar exames, dieta e rotina antes de indicar." }],
};

const notes: Record<TargetGroup, string> = {
  ADULTO_SAUDAVEL: "Organizar refeicoes equilibradas e sustentaveis. Ajustar quantidades por rotina, exames e objetivo.",
  EMAGRECIMENTO: "Aumentar saciedade e preservar massa magra. Evitar condutas restritivas sem acompanhamento.",
  HIPERTROFIA: "Distribuir energia e proteina ao longo do dia para apoiar treino e recuperacao.",
  IDOSO: "Priorizar proteina, fibras, hidratacao e consistencia segura conforme mastigacao/degluticao.",
  GESTANTE: "Atenção: evitar carnes e ovos crus, alcool e alimentos de risco. Suplementacao deve ser individualizada e alinhada ao obstetra.",
  CRIANCA: "Atenção: respeitar apetite, fase alimentar e familia. Nao usar comida como premio ou punicao.",
  TEA: "Atenção: respeitar perfil sensorial, previsibilidade e recusa. Nao forcar exposicoes.",
  SOP: "Foco em saciedade, qualidade de carboidratos, proteina adequada e suporte anti-inflamatorio.",
  VEGETARIANO_ESTRITO: "Monitorar B12, ferro, zinco, calcio, vitamina D e proteina total.",
  ENDURANCE: "Ajustar carboidrato, sodio e hidratacao conforme volume, intensidade e tolerancia gastrointestinal.",
  RESISTENCIA_INSULINA: "Priorizar controle glicemico, fibras, proteina e qualidade de carboidratos.",
};

const groups = Object.keys(notes) as TargetGroup[];

const seeds: Seed[] = groups.flatMap((group) => {
  const meals = group in specializedMeals
    ? specializedMeals[group as keyof typeof specializedMeals]
    : genericMeals[group as keyof typeof genericMeals];
  return [
    { id: `tpl-${group.toLowerCase()}-dieta-base`, type: "DIETA", target_group: group, title: `Dieta base - ${groupLabel(group)}`, notes: notes[group], meals, substitutions: commonSubstitutions() },
    { id: `tpl-${group.toLowerCase()}-suplementacao-base`, type: "SUPLEMENTACAO", target_group: group, title: `Suplementacao base - ${groupLabel(group)}`, notes: notes[group], supplements: supplements[group] },
    { id: `tpl-${group.toLowerCase()}-substituicoes-base`, type: "SUBSTITUICAO", target_group: group, title: `Substituicoes base - ${groupLabel(group)}`, notes: "Trocas devem preservar grupo alimentar, porcao e contexto clinico.", substitutions: commonSubstitutions() },
  ];
});

async function replaceMeals(templateId: string, meals: Meal[]) {
  await query("DELETE FROM diet_template_items WHERE meal_id IN (SELECT id FROM diet_template_meals WHERE template_id = ?1)", [templateId]);
  await query("DELETE FROM diet_template_meals WHERE template_id = ?1", [templateId]);
  const now = new Date().toISOString();
  for (const [mealIndex, row] of meals.entries()) {
    const mealId = crypto.randomUUID();
    await query(
      `INSERT INTO diet_template_meals (id, template_id, name, suggested_time, notes, source_recipe_id, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7, ?8)`,
      [mealId, templateId, row.name, row.suggested_time ?? null, row.notes ?? null, mealIndex, now, now]
    );
    for (const [itemIndex, item] of row.items.entries()) {
      await query(
        `INSERT INTO diet_template_items (id, meal_id, food, quantity, unit, notes, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        [crypto.randomUUID(), mealId, item.food, item.quantity, item.unit, item.notes ?? null, itemIndex, now, now]
      );
    }
  }
}

async function replaceSubstitutions(templateId: string, rows: Substitution[]) {
  await query("DELETE FROM diet_template_substitutions WHERE template_id = ?1", [templateId]);
  const now = new Date().toISOString();
  for (const [index, item] of rows.entries()) {
    await query(
      `INSERT INTO diet_template_substitutions (id, template_id, base_food, option_food, quantity, unit, notes, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      [crypto.randomUUID(), templateId, item.base_food, item.option_food, item.quantity ?? null, item.unit ?? null, item.notes ?? null, index, now, now]
    );
  }
}

async function replaceSupplements(templateId: string, rows: Supplement[]) {
  await query("DELETE FROM diet_template_supplements WHERE template_id = ?1", [templateId]);
  const now = new Date().toISOString();
  for (const [index, item] of rows.entries()) {
    await query(
      `INSERT INTO diet_template_supplements (id, template_id, name, dosage, unit, instructions, notes, sort_order, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      [crypto.randomUUID(), templateId, item.name, item.dosage ?? null, item.unit ?? null, item.instructions ?? null, item.notes ?? null, index, now, now]
    );
  }
}

async function main() {
  for (const seed of seeds) {
    const now = new Date().toISOString();
    await query(
      `INSERT OR REPLACE INTO protocol_templates
        (id, type, target_group, title, content, notes, is_active, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, '', ?5, 1, COALESCE((SELECT created_at FROM protocol_templates WHERE id = ?1), ?6), ?7)`,
      [seed.id, seed.type, seed.target_group, seed.title, seed.notes, now, now]
    );
    await replaceMeals(seed.id, seed.meals ?? []);
    await replaceSubstitutions(seed.id, seed.substitutions ?? []);
    await replaceSupplements(seed.id, seed.supplements ?? []);
  }

  console.log(`${seeds.length} modelo(s) estruturado(s) inserido(s)/atualizado(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
