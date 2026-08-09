export type EducationSuggestionMatch = {
  slug: string;
  keywords: string[];
};

export const DIAGNOSIS_CARD_KEYWORDS: Record<string, string[]> = {
  "anemia-ferropriva": [
    "anemia ferropriva",
    "deficiencia de ferro",
    "ferritina baixa",
    "ferropenia",
    "ferro baixo",
  ],
  "doenca-celiaca": [
    "doenca celiaca",
    "celiaca",
    "celiaco",
    "enteropatia por gluten",
  ],
  hipotireoidismo: [
    "hipotireoidismo",
    "hipo tireoidismo",
    "tsh alto",
    "tireoide lenta",
  ],
  "diabetes-tipo-2": [
    "diabetes tipo 2",
    "diabetes mellitus tipo 2",
    "diabetes mellitus 2",
    "dm2",
    "diabetes",
  ],
  "hipertensao-arterial": [
    "hipertensao",
    "hipertensao arterial",
    "pressao alta",
    "has",
  ],
  "intolerancia-a-lactose": [
    "intolerancia a lactose",
    "intolerante a lactose",
    "lactose",
  ],
  "sop-sindrome-do-ovario-policistico": [
    "sop",
    "sindrome do ovario policistico",
    "ovario policistico",
  ],
  "resistencia-a-insulina": [
    "resistencia a insulina",
    "resistencia insulinica",
    "pre diabetes",
    "prediabetes",
  ],
  "doenca-renal-cronica-fase-inicial": [
    "doenca renal cronica",
    "drc",
    "insuficiencia renal cronica",
  ],
  "refluxo-gastroesofagico-e-gastrite": [
    "refluxo",
    "refluxo gastroesofagico",
    "drge",
    "gastrite",
    "esofagite",
  ],
};

const EXCLUDED_CONTEXT_MARKERS = [
  "historico familiar",
  "antecedente familiar",
  "familia",
  "mae com",
  "pai com",
  "avo com",
  "irmao com",
  "nega",
  "sem diagnostico",
  "nao tem",
  "nao possui",
  "descartado",
  "descartada",
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function suggestEducationCardsFromDiagnoses(diagnoses: string | null | undefined): EducationSuggestionMatch[] {
  if (!diagnoses?.trim()) return [];
  const chunks = normalize(diagnoses)
    .split(/[\n;,|.]+/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .filter((chunk) => !EXCLUDED_CONTEXT_MARKERS.some((marker) => chunk.includes(marker)));

  const matches: EducationSuggestionMatch[] = [];
  for (const [slug, keywords] of Object.entries(DIAGNOSIS_CARD_KEYWORDS)) {
    const normalizedKeywords = keywords.map(normalize).sort((a, b) => b.length - a.length);
    const found = normalizedKeywords
      .filter((keyword) => chunks.some((chunk) => chunk.includes(keyword)))
      .filter((keyword, _index, all) => !all.some((other) => other !== keyword && other.includes(keyword)));
    if (found.length) matches.push({ slug, keywords: found });
  }
  return matches;
}
