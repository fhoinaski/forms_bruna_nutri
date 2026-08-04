import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

type TemplateSeed = {
  id: string;
  type: TemplateType;
  target_group: TargetGroup;
  title: string;
  content: unknown;
};

type CoreTargetGroup = Exclude<TargetGroup, "SOP" | "VEGETARIANO_ESTRITO" | "ENDURANCE" | "RESISTENCIA_INSULINA">;

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

const substitutions = {
  observacao: "Trocar apenas por alimentos do mesmo grupo, respeitando porcao e contexto clinico.",
  carboidratos_cereais: {
    porcao_referencia: "1 porcao aproximada de 120-160 kcal",
    opcoes: ["arroz cozido", "batata cozida", "mandioca", "macarrao", "aveia", "pao integral", "quinoa"],
  },
  proteinas: {
    porcao_referencia: "1 porcao com cerca de 20-25g de proteina",
    opcoes: ["frango", "peixe", "ovos", "carne magra", "tofu", "grao-de-bico", "lentilha"],
  },
  frutas: {
    porcao_referencia: "1 unidade media ou 1 xicara",
    opcoes: ["maca", "banana", "laranja", "mamao", "pera", "morango", "melao"],
  },
  vegetais: {
    porcao_referencia: "a vontade, salvo restricao individual",
    opcoes: ["alface", "rucula", "tomate", "cenoura", "brocolis", "abobrinha", "couve-flor"],
  },
  gorduras_boas: {
    porcao_referencia: "1 porcao pequena",
    opcoes: ["azeite", "abacate", "castanhas", "pasta de amendoim", "chia", "linhaca"],
  },
};

const dietBase = {
  ADULTO_SAUDAVEL: {
    nome: "Adulto saudavel - manutencao",
    objetivo: "Organizar refeicoes equilibradas e sustentaveis.",
    refeicoes: {
      cafe_da_manha: ["carboidrato integral", "laticinio ou proteina", "fruta"],
      lanche_manha: ["fruta", "gordura boa opcional"],
      almoco: ["carboidrato", "proteina", "leguminosa", "vegetais", "gordura boa"],
      lanche_tarde: ["laticinio ou fruta", "carboidrato leve"],
      jantar: ["proteina", "vegetais", "carboidrato conforme rotina"],
      ceia: ["fruta ou laticinio se necessario"],
    },
  },
  EMAGRECIMENTO: {
    nome: "Emagrecimento - deficit calorico",
    objetivo: "Aumentar saciedade, preservar massa magra e reduzir densidade calorica.",
    refeicoes: {
      cafe_da_manha: ["proteina", "carboidrato integral controlado", "fruta"],
      lanche_manha: ["fruta com casca ou bagaco"],
      almoco: ["proteina magra", "vegetais em maior volume", "carboidrato reduzido", "gordura boa"],
      lanche_tarde: ["iogurte natural ou fruta"],
      jantar: ["proteina magra", "vegetais", "carboidrato opcional conforme evolucao"],
      ceia: ["cha sem acucar ou pequena porcao proteica se necessario"],
    },
  },
  HIPERTROFIA: {
    nome: "Hipertrofia - ganho de massa",
    objetivo: "Distribuir proteina e energia ao longo do dia para apoiar treino e recuperacao.",
    refeicoes: {
      cafe_da_manha: ["2 porcoes de carboidrato", "proteina", "fruta", "gordura boa"],
      lanche_manha: ["fruta", "proteina", "carboidrato"],
      almoco: ["carboidrato ampliado", "proteina", "leguminosa", "vegetais"],
      lanche_tarde: ["laticinio ou proteina", "carboidrato", "fruta"],
      jantar: ["carboidrato", "proteina", "vegetais"],
      ceia: ["proteina lenta ou laticinio", "gordura boa opcional"],
    },
  },
  IDOSO: {
    nome: "Idoso - suporte a massa magra",
    objetivo: "Priorizar proteina, fibras, calcio, vitamina D e hidratacao.",
    refeicoes: {
      cafe_da_manha: ["carboidrato integral", "laticinio", "fruta macia"],
      lanche_manha: ["fruta", "sementes moidas se tolerado"],
      almoco: ["carboidrato", "proteina macia", "leguminosa bem cozida", "vegetais cozidos"],
      lanche_tarde: ["laticinio", "fruta"],
      jantar: ["proteina macia", "carboidrato leve", "vegetais cozidos"],
      ceia: ["laticinio ou preparacao proteica leve"],
    },
  },
  GESTANTE: {
    nome: "Gestante - seguranca alimentar",
    objetivo: "Apoiar necessidades aumentadas e reduzir riscos alimentares.",
    refeicoes: {
      cafe_da_manha: ["carboidrato integral", "laticinio", "fruta rica em vitamina C"],
      lanche_manha: ["fruta", "castanhas"],
      almoco: ["carboidrato", "proteina bem cozida", "leguminosa", "folhosos higienizados", "gordura boa"],
      lanche_tarde: ["laticinio", "fruta"],
      jantar: ["carboidrato leve", "proteina bem cozida", "vegetais"],
      ceia: ["laticinio se tolerado"],
    },
    atencao_especial: ["evitar carnes e ovos crus", "evitar alcool", "higienizar vegetais", "individualizar suplementacao"],
  },
  CRIANCA: {
    nome: "Crianca - rotina familiar",
    objetivo: "Construir variedade, autonomia e vinculo positivo com comida.",
    refeicoes: {
      cafe_da_manha: ["carboidrato", "laticinio ou proteina", "fruta"],
      lanche_manha: ["fruta ou vegetal aceito"],
      almoco: ["carboidrato", "proteina em tamanho adequado", "leguminosa", "vegetais coloridos"],
      lanche_tarde: ["laticinio ou fruta", "carboidrato pequeno"],
      jantar: ["versao reduzida do almoco"],
      ceia: ["laticinio se fizer parte da rotina"],
    },
    atencao_especial: ["nao usar comida como premio ou punicao", "oferecer agua", "evitar pressao nas refeicoes"],
  },
  TEA: {
    nome: "TEA - suporte alimentar respeitoso",
    objetivo: "Respeitar perfil sensorial, previsibilidade e progresso gradual.",
    refeicoes: {
      cafe_da_manha: ["carboidrato aceito", "proteina ou laticinio aceito", "exposicao pequena a fruta"],
      lanche_manha: ["alimento de textura conhecida"],
      almoco: ["carboidrato aceito", "proteina no formato tolerado", "vegetal separado no prato"],
      lanche_tarde: ["opcao aceita + novidade opcional muito pequena"],
      jantar: ["semelhante ao almoco, mantendo previsibilidade"],
      ceia: ["opcao conforme rotina sensorial"],
    },
    atencao_especial: ["nunca forcar recusa", "evitar misturas se houver aversao", "considerar equipe multidisciplinar"],
  },
} satisfies Record<CoreTargetGroup, unknown>;

const supplementBase = {
  ADULTO_SAUDAVEL: ["Vitamina D conforme exames", "Omega-3 conforme consumo alimentar", "Multivitaminico apenas se necessario"],
  EMAGRECIMENTO: ["Proteina para meta proteica", "Fibra com agua", "Omega-3 conforme indicacao"],
  HIPERTROFIA: ["Proteina conforme meta", "Creatina monohidratada", "Carboidrato esportivo conforme treino"],
  IDOSO: ["Vitamina D conforme exames", "B12 conforme dosagem", "Proteina complementar se ingestao baixa"],
  GESTANTE: ["Acido folico conforme prescricao", "Ferro conforme exames", "DHA conforme orientacao", "Prenatal conforme obstetra"],
  CRIANCA: ["Vitamina D conforme idade/exames", "Ferro apenas com deficiencia confirmada", "Polivitaminico infantil se dieta muito restrita"],
  TEA: ["Polivitaminico se seletividade importante", "Vitamina D conforme exames", "Omega-3 se indicado e aceito sensorialmente", "Zinco apenas com deficiencia"],
} satisfies Record<CoreTargetGroup, string[]>;

const seeds: TemplateSeed[] = Object.keys(dietBase).flatMap((groupKey) => {
  const group = groupKey as CoreTargetGroup;
  return [
    {
      id: `tpl-${group.toLowerCase()}-dieta-base`,
      type: "DIETA",
      target_group: group,
      title: `Dieta base - ${group.replaceAll("_", " ").toLowerCase()}`,
      content: dietBase[group],
    },
    {
      id: `tpl-${group.toLowerCase()}-suplementacao-base`,
      type: "SUPLEMENTACAO",
      target_group: group,
      title: `Suplementação base - ${group.replaceAll("_", " ").toLowerCase()}`,
      content: {
        objetivo: "Usar apenas após avaliação clínica, exames e revisão profissional.",
        suplementos_sugeridos: supplementBase[group].map((item) => ({ nutriente: item, conduta: "Individualizar dose, apresentação e duração." })),
      },
    },
    {
      id: `tpl-${group.toLowerCase()}-substituicoes-base`,
      type: "SUBSTITUICAO",
      target_group: group,
      title: `Substituições base - ${group.replaceAll("_", " ").toLowerCase()}`,
      content: substitutions,
    },
  ];
});

seeds.push(
  {
    id: "tpl_sop_dieta_01",
    type: "DIETA",
    target_group: "SOP",
    title: "Dieta Padrão - Síndrome do Ovário Policístico (Anti-inflamatória)",
    content: {
      refeicoes: [
        { nome: "Café da Manhã", itens: [
          { alimento: "Ovos inteiros cozidos", quantidade: 150, unidade: "g" },
          { alimento: "Abacate", quantidade: 50, unidade: "g" },
          { alimento: "Semente de abóbora", quantidade: 15, unidade: "g" },
        ] },
        { nome: "Almoço", itens: [
          { alimento: "Peito de frango grelhado", quantidade: 120, unidade: "g" },
          { alimento: "Quinoa cozida", quantidade: 100, unidade: "g" },
          { alimento: "Brócolis cozido", quantidade: 100, unidade: "g" },
          { alimento: "Azeite de oliva extravirgem", quantidade: 10, unidade: "g" },
        ] },
        { nome: "Lanche da Tarde", itens: [
          { alimento: "Leite de amêndoas", quantidade: 200, unidade: "ml" },
          { alimento: "Whey Protein Isolado", quantidade: 30, unidade: "g" },
          { alimento: "Morango", quantidade: 100, unidade: "g" },
        ] },
        { nome: "Jantar", itens: [
          { alimento: "Filé de salmão assado", quantidade: 120, unidade: "g" },
          { alimento: "Aspargos refogados", quantidade: 100, unidade: "g" },
          { alimento: "Semente de girassol", quantidade: 10, unidade: "g" },
        ] },
      ],
    },
  },
  {
    id: "tpl_sop_supl_01",
    type: "SUPLEMENTACAO",
    target_group: "SOP",
    title: "Suplementação - SOP",
    content: {
      suplementos: [
        { nome: "Mio-inositol", dosagem: 2, unidade: "g", indicacao: "Uso diário pela manhã" },
        { nome: "D-Chiro Inositol", dosagem: 50, unidade: "mg", indicacao: "Junto ao Mio-inositol" },
        { nome: "Vitamina D3", dosagem: 2000, unidade: "UI", indicacao: "Junto à principal refeição" },
        { nome: "Zinco Quelato", dosagem: 15, unidade: "mg", indicacao: "Antes de dormir" },
      ],
    },
  },
  {
    id: "tpl_sop_subs_01",
    type: "SUBSTITUICAO",
    target_group: "SOP",
    title: "Substituições - SOP",
    content: {
      grupos: [
        {
          base: { alimento: "Quinoa cozida", quantidade: 100, unidade: "g" },
          opcoes: [
            { alimento: "Arroz negro cozido", quantidade: 100, unidade: "g" },
            { alimento: "Arroz integral cozido", quantidade: 100, unidade: "g" },
            { alimento: "Grão de bico cozido", quantidade: 80, unidade: "g" },
          ],
        },
      ],
    },
  },
  {
    id: "tpl_veg_dieta_01",
    type: "DIETA",
    target_group: "VEGETARIANO_ESTRITO",
    title: "Dieta Padrão - Vegetariano Estrito (Vegano)",
    content: {
      refeicoes: [
        { nome: "Café da Manhã", itens: [
          { alimento: "Tofu mexido com açafrão", quantidade: 150, unidade: "g" },
          { alimento: "Pão de forma integral", quantidade: 50, unidade: "g" },
          { alimento: "Kiwi", quantidade: 100, unidade: "g" },
        ] },
        { nome: "Almoço", itens: [
          { alimento: "Lentilha cozida", quantidade: 150, unidade: "g" },
          { alimento: "Arroz integral cozido", quantidade: 100, unidade: "g" },
          { alimento: "Proteína texturizada de soja (PTS)", quantidade: 50, unidade: "g" },
          { alimento: "Couve refogada (fonte de cálcio/ferro)", quantidade: 100, unidade: "g" },
          { alimento: "Laranja (vitamina C para absorção do ferro)", quantidade: 100, unidade: "g" },
        ] },
        { nome: "Lanche da Tarde", itens: [
          { alimento: "Proteína isolada de ervilha", quantidade: 30, unidade: "g" },
          { alimento: "Banana prata", quantidade: 100, unidade: "g" },
          { alimento: "Pasta de amendoim", quantidade: 15, unidade: "g" },
        ] },
        { nome: "Jantar", itens: [
          { alimento: "Grão de bico cozido", quantidade: 150, unidade: "g" },
          { alimento: "Legumes assados (abóbora, cenoura)", quantidade: 150, unidade: "g" },
          { alimento: "Semente de gergelim triturada", quantidade: 15, unidade: "g" },
        ] },
      ],
    },
  },
  {
    id: "tpl_veg_supl_01",
    type: "SUPLEMENTACAO",
    target_group: "VEGETARIANO_ESTRITO",
    title: "Suplementação - Vegetariano Estrito",
    content: {
      suplementos: [
        { nome: "Vitamina B12 (Metilcobalamina)", dosagem: 500, unidade: "mcg", indicacao: "Uso diário em jejum" },
        { nome: "Creatina Monohidratada", dosagem: 5, unidade: "g", indicacao: "Uso diário" },
        { nome: "Ferro Quelato", dosagem: 40, unidade: "mg", indicacao: "Avaliar via ferritina sérica" },
      ],
    },
  },
  {
    id: "tpl_veg_subs_01",
    type: "SUBSTITUICAO",
    target_group: "VEGETARIANO_ESTRITO",
    title: "Substituições - Vegetariano Estrito",
    content: {
      grupos: [
        {
          base: { alimento: "Lentilha cozida", quantidade: 150, unidade: "g" },
          opcoes: [
            { alimento: "Grão de bico cozido", quantidade: 150, unidade: "g" },
            { alimento: "Feijão preto cozido", quantidade: 150, unidade: "g" },
            { alimento: "Ervilha cozida", quantidade: 150, unidade: "g" },
          ],
        },
        {
          base: { alimento: "Tofu", quantidade: 150, unidade: "g" },
          opcoes: [
            { alimento: "Tempeh", quantidade: 100, unidade: "g" },
            { alimento: "PTS hidratada", quantidade: 100, unidade: "g" },
          ],
        },
      ],
    },
  },
  {
    id: "tpl_endurance_dieta_01",
    type: "DIETA",
    target_group: "ENDURANCE",
    title: "Dieta Padrão - Alta Performance (Endurance)",
    content: {
      refeicoes: [
        { nome: "Pré-treino (1h antes)", itens: [
          { alimento: "Pão francês", quantidade: 100, unidade: "g" },
          { alimento: "Geleia de fruta", quantidade: 40, unidade: "g" },
          { alimento: "Suco de uva integral", quantidade: 300, unidade: "ml" },
        ] },
        { nome: "Intra-treino (a cada 45 min)", itens: [
          { alimento: "Gel de carboidrato", quantidade: 30, unidade: "g" },
        ] },
        { nome: "Pós-treino imediato", itens: [
          { alimento: "Whey Protein Concentrado", quantidade: 30, unidade: "g" },
          { alimento: "Doce de leite", quantidade: 50, unidade: "g" },
        ] },
        { nome: "Almoço (reposição de glicogênio)", itens: [
          { alimento: "Macarrão cozido", quantidade: 300, unidade: "g" },
          { alimento: "Patinho moído", quantidade: 120, unidade: "g" },
          { alimento: "Molho de tomate", quantidade: 100, unidade: "g" },
        ] },
      ],
    },
  },
  {
    id: "tpl_endurance_supl_01",
    type: "SUPLEMENTACAO",
    target_group: "ENDURANCE",
    title: "Suplementação - Endurance",
    content: {
      suplementos: [
        { nome: "Palatinose", dosagem: 20, unidade: "g", indicacao: "Misturar na garrafa intra-treino" },
        { nome: "Cápsula de sal (Eletrólitos)", dosagem: 1, unidade: "unidade", indicacao: "A cada 60 min de treino intenso" },
        { nome: "Suco de beterraba concentrado (Nitrato)", dosagem: 400, unidade: "ml", indicacao: "2 horas antes da prova/treino longo" },
      ],
    },
  },
  {
    id: "tpl_endurance_subs_01",
    type: "SUBSTITUICAO",
    target_group: "ENDURANCE",
    title: "Substituições - Endurance",
    content: {
      grupos: [
        {
          base: { alimento: "Pão francês", quantidade: 100, unidade: "g" },
          opcoes: [
            { alimento: "Tapioca (goma)", quantidade: 100, unidade: "g" },
            { alimento: "Creme de arroz", quantidade: 80, unidade: "g" },
          ],
        },
      ],
    },
  },
  {
    id: "tpl_res_insul_dieta_01",
    type: "DIETA",
    target_group: "RESISTENCIA_INSULINA",
    title: "Dieta Padrão - Controle Glicêmico",
    content: {
      refeicoes: [
        { nome: "Café da Manhã", itens: [
          { alimento: "Ovos inteiros", quantidade: 150, unidade: "g" },
          { alimento: "Abacate", quantidade: 50, unidade: "g" },
          { alimento: "Farelo de aveia", quantidade: 20, unidade: "g" },
        ] },
        { nome: "Almoço", itens: [
          { alimento: "Salada de folhas verdes", quantidade: 150, unidade: "g" },
          { alimento: "Peito de frango grelhado", quantidade: 130, unidade: "g" },
          { alimento: "Feijão preto cozido", quantidade: 80, unidade: "g" },
          { alimento: "Arroz integral cozido", quantidade: 60, unidade: "g" },
        ] },
        { nome: "Jantar", itens: [
          { alimento: "Filé de tilápia", quantidade: 150, unidade: "g" },
          { alimento: "Abobrinha e berinjela refogadas", quantidade: 150, unidade: "g" },
          { alimento: "Azeite de oliva", quantidade: 10, unidade: "g" },
        ] },
      ],
    },
  },
  {
    id: "tpl_res_insul_supl_01",
    type: "SUPLEMENTACAO",
    target_group: "RESISTENCIA_INSULINA",
    title: "Suplementação - Resistência à Insulina",
    content: {
      suplementos: [
        { nome: "Coenzima Q10", dosagem: 100, unidade: "mg", indicacao: "Junto ao almoço" },
        { nome: "Magnésio Dimalato", dosagem: 250, unidade: "mg", indicacao: "Antes de dormir" },
        { nome: "Ácido Alfa Lipóico", dosagem: 300, unidade: "mg", indicacao: "Junto à principal refeição" },
        { nome: "Picolinato de Cromo", dosagem: 200, unidade: "mcg", indicacao: "Uso diário" },
      ],
    },
  }
);

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

async function main() {
  for (const seed of seeds) {
    const now = new Date().toISOString();
    await query(
      `INSERT OR REPLACE INTO protocol_templates
        (id, type, target_group, title, content, is_active, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, COALESCE((SELECT created_at FROM protocol_templates WHERE id = ?1), ?6), ?7)`,
      [seed.id, seed.type, seed.target_group, seed.title, JSON.stringify(seed.content, null, 2), now, now]
    );
  }

  console.log(`${seeds.length} modelo(s) de protocolo inserido(s)/atualizado(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
