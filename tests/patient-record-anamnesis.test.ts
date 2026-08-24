import { describe, expect, it } from "vitest";
import {
  ANAMNESIS_SECTIONS,
  availableAnamnesisLifeStages,
  countAnsweredAnamnesisFields,
  formatAnamnesisAnswer,
  getKeyClinicalInfo,
  getVisibleAnamnesisFields,
  sanitizeAnamnesisSectionPatch,
  type AnamnesisRecordLike,
} from "@/lib/clinical/patient-anamnesis";

function record(overrides: Partial<AnamnesisRecordLike> = {}): AnamnesisRecordLike {
  const base = Object.fromEntries(
    ANAMNESIS_SECTIONS.flatMap((section) => section.fields.map((field) => [field.key, null]))
  ) as unknown as AnamnesisRecordLike;
  return { ...base, version: 1, updated_at: "2026-08-23T10:00:00.000Z", ...overrides };
}

describe("patient anamnesis section model", () => {
  it("groups real nutrition record fields into clinical sections", () => {
    expect(ANAMNESIS_SECTIONS.map((section) => section.id)).toEqual([
      "objetivo",
      "perfil",
      "saude",
      "rotina",
      "rotina-alimentar",
      "medidas-contexto",
      "conduta",
    ]);
    expect(ANAMNESIS_SECTIONS.flatMap((section) => section.fields.map((field) => field.key))).toContain("allergies");
    expect(ANAMNESIS_SECTIONS.flatMap((section) => section.fields.map((field) => field.key))).toContain("sleep_routine");
  });

  it("counts latest answers without false completion", () => {
    const section = ANAMNESIS_SECTIONS.find((item) => item.id === "rotina")!;
    const stats = countAnsweredAnamnesisFields(record({ sleep_routine: "7h, qualidade regular" }), section);
    expect(stats.answered).toBe(1);
    expect(stats.total).toBe(5);
  });

  it("formats empty, dated and unit answers for read mode", () => {
    expect(formatAnamnesisAnswer(null, { key: "sleep_routine", inputType: "textarea" })).toBe("Nao informado");
    expect(formatAnamnesisAnswer("2026-08-20", { key: "bariatric_surgery_date", inputType: "date" })).toBe("20/08/2026");
    expect(formatAnamnesisAnswer("68,5", { key: "current_weight_kg", inputType: "text", unit: "kg" })).toBe("68,5 kg");
  });

  it("respects conditional fields without losing persisted historical values", () => {
    const medidas = ANAMNESIS_SECTIONS.find((item) => item.id === "medidas-contexto")!;
    expect(getVisibleAnamnesisFields(record({ target_group: "BARIATRICO" }), medidas).map((field) => field.key)).toContain("bariatric_surgery_date");
    expect(getVisibleAnamnesisFields(record({ target_group: null }), medidas).map((field) => field.key)).not.toContain("bariatric_surgery_date");
    expect(getVisibleAnamnesisFields(record({ target_group: null, bariatric_surgery_date: "2026-01-01" }), medidas).map((field) => field.key)).toContain("bariatric_surgery_date");
  });

  it("keeps gestational branches unavailable for male biological sex", () => {
    expect(availableAnamnesisLifeStages(record({ biological_sex: "Masculino" }))).not.toContain("Gestacao");
    expect(availableAnamnesisLifeStages(record({ biological_sex: "Feminino" }))).toContain("Gestacao");
  });

  it("sanitizes section saves and blocks mass assignment outside the edited section", () => {
    const section = ANAMNESIS_SECTIONS.find((item) => item.id === "rotina")!;
    const patch = sanitizeAnamnesisSectionPatch(section, {
      sleep_routine: " 6h ",
      intestinal_health: "",
      allergies: "leite",
    });
    expect(patch).toEqual({ sleep_routine: "6h", intestinal_health: null });
  });

  it("supports cancel semantics by deriving draft patch separately from persisted record", () => {
    const persisted = record({ sleep_routine: "7h" });
    const draft = { sleep_routine: "5h" };
    expect(persisted.sleep_routine).toBe("7h");
    expect(draft.sleep_routine).toBe("5h");
  });

  it("keeps structured restriction source fields visible as stable clinical info", () => {
    const info = getKeyClinicalInfo(record({
      allergies: "Leite",
      restrictions: "Vegetariana",
      medications: "Levotiroxina",
      food_preferences: "Arroz e feijao",
    }));
    expect(info).toEqual([
      { label: "Alergias", value: "Leite" },
      { label: "Restricoes", value: "Vegetariana" },
      { label: "Medicamentos", value: "Levotiroxina" },
      { label: "Preferencias", value: "Arroz e feijao" },
    ]);
  });
});
