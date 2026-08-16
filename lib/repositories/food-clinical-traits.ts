import { d1Batch, d1Execute, d1Query } from "@/lib/d1/client";
import {
  FOOD_CLINICAL_TRAIT_PROVENANCES,
  FOOD_CLINICAL_TRAIT_RELATIONS,
  normalizeFoodClinicalTraitCode,
  type FoodClinicalTrait,
  type FoodClinicalTraitProvenance,
  type FoodClinicalTraitRelation,
  type PersistedFoodClinicalProfileSource,
} from "@/lib/clinical/food-clinical-traits";

export interface FoodClinicalTraitRow {
  id: string;
  food_source: PersistedFoodClinicalProfileSource;
  food_ref_id: string;
  trait_code: string;
  relation: FoodClinicalTraitRelation;
  provenance: FoodClinicalTraitProvenance;
  evidence_text: string | null;
  created_by_admin_id: string | null;
  updated_by_admin_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FoodClinicalTraitInput {
  code: string;
  relation: FoodClinicalTraitRelation;
  provenance: FoodClinicalTraitProvenance;
  evidenceText?: string | null;
}

export function hydrateFoodClinicalTrait(row: FoodClinicalTraitRow): FoodClinicalTrait {
  return {
    code: normalizeFoodClinicalTraitCode(row.trait_code) ?? "MILK",
    relation: row.relation,
    provenance: row.provenance,
    evidenceText: row.evidence_text,
  };
}

function assertEditableSource(foodSource: PersistedFoodClinicalProfileSource) {
  if (foodSource === "TACO") throw new Error("TACO clinical traits are system-curated and read-only.");
}

function validateTraits(traits: FoodClinicalTraitInput[]): FoodClinicalTraitInput[] {
  const seen = new Set<string>();
  return traits.map((trait) => {
    const code = normalizeFoodClinicalTraitCode(trait.code);
    if (!code) throw new Error(`Invalid food clinical trait code: ${trait.code}`);
    if (!(FOOD_CLINICAL_TRAIT_RELATIONS as readonly string[]).includes(trait.relation)) {
      throw new Error(`Invalid food clinical trait relation: ${trait.relation}`);
    }
    if (!(FOOD_CLINICAL_TRAIT_PROVENANCES as readonly string[]).includes(trait.provenance)) {
      throw new Error(`Invalid food clinical trait provenance: ${trait.provenance}`);
    }
    if (seen.has(code)) throw new Error(`Duplicate food clinical trait code: ${code}`);
    seen.add(code);
    return { ...trait, code };
  });
}

export async function listFoodClinicalTraitRows(
  foodSource: PersistedFoodClinicalProfileSource,
  foodRefId: string
): Promise<FoodClinicalTraitRow[]> {
  return d1Query<FoodClinicalTraitRow>(
    `SELECT * FROM food_clinical_traits
     WHERE food_source = ?1 AND food_ref_id = ?2
     ORDER BY trait_code ASC`,
    [foodSource, foodRefId]
  );
}

export async function listFoodClinicalTraits(
  foodSource: PersistedFoodClinicalProfileSource,
  foodRefId: string
): Promise<FoodClinicalTrait[]> {
  return (await listFoodClinicalTraitRows(foodSource, foodRefId)).map(hydrateFoodClinicalTrait);
}

export async function replaceFoodClinicalTraits(input: {
  foodSource: PersistedFoodClinicalProfileSource;
  foodRefId: string;
  traits: FoodClinicalTraitInput[];
  adminId: string;
}): Promise<FoodClinicalTrait[]> {
  assertEditableSource(input.foodSource);
  const traits = validateTraits(input.traits);
  const previous = await listFoodClinicalTraitRows(input.foodSource, input.foodRefId);
  const now = new Date().toISOString();
  const statements = [
    {
      sql: `DELETE FROM food_clinical_traits WHERE food_source = ?1 AND food_ref_id = ?2`,
      params: [input.foodSource, input.foodRefId],
    },
    ...traits.map((trait) => ({
      sql: `INSERT INTO food_clinical_traits
        (id, food_source, food_ref_id, trait_code, relation, provenance, evidence_text,
         created_by_admin_id, updated_by_admin_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
      params: [
        crypto.randomUUID(),
        input.foodSource,
        input.foodRefId,
        trait.code,
        trait.relation,
        trait.provenance,
        trait.evidenceText?.trim() || null,
        input.adminId,
        input.adminId,
        now,
        now,
      ],
    })),
    {
      sql: `INSERT INTO food_clinical_trait_events
        (id, food_source, food_ref_id, action, previous_traits_json, next_traits_json, provenance, admin_id, created_at)
       VALUES (?1, ?2, ?3, 'replaced', ?4, ?5, ?6, ?7, ?8)`,
      params: [
        crypto.randomUUID(),
        input.foodSource,
        input.foodRefId,
        JSON.stringify(previous.map(hydrateFoodClinicalTrait)),
        JSON.stringify(traits),
        traits[0]?.provenance ?? null,
        input.adminId,
        now,
      ],
    },
  ];
  await d1Batch(statements);
  return listFoodClinicalTraits(input.foodSource, input.foodRefId);
}

export async function recordFoodClinicalTraitSuggestionRejected(input: {
  foodSource: PersistedFoodClinicalProfileSource;
  foodRefId: string;
  traits: FoodClinicalTraitInput[];
  adminId: string;
}): Promise<void> {
  assertEditableSource(input.foodSource);
  const traits = validateTraits(input.traits);
  await d1Execute(
    `INSERT INTO food_clinical_trait_events
      (id, food_source, food_ref_id, action, previous_traits_json, next_traits_json, provenance, admin_id, created_at)
     VALUES (?1, ?2, ?3, 'deleted', NULL, ?4, 'AI_SUGGESTED_CONFIRMED', ?5, ?6)`,
    [
      crypto.randomUUID(),
      input.foodSource,
      input.foodRefId,
      JSON.stringify({ rejectedSuggestion: traits }),
      input.adminId,
      new Date().toISOString(),
    ]
  );
}
