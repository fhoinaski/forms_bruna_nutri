"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Database, Edit3, Loader2, Plus, Save, Search, ShieldCheck, X } from "lucide-react";
import {
  FOOD_CLINICAL_TRAIT_CODES,
  FOOD_CLINICAL_TRAIT_LABELS,
  FOOD_CLINICAL_TRAIT_RELATIONS,
  type FoodClinicalProfile,
  type FoodClinicalTrait,
  type FoodClinicalTraitCode,
  type FoodClinicalTraitRelation,
} from "@/lib/clinical/food-clinical-traits";

type FoodSource = "TACO" | "COMPLEMENTARY" | "USDA" | "CUSTOM" | "MANUFACTURER";

type FoodReference = {
  source: FoodSource;
  sourceId: string;
};

type FoodSearchItem = {
  ref: FoodReference;
  name: string;
  brand: string | null;
  group: string | null;
  sourceLabel: string;
  energyKcal: number | null;
  proteinG: number | null;
  carbohydrateG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

type NutrientValue = {
  code: string;
  label: string;
  unit: string;
  value: number | null;
};

type FoodPortion = {
  id: string;
  label: string;
  gramWeight: number | null;
  confidence: string;
  source: string;
};

type FoodDetail = {
  food: {
    ref: FoodReference;
    name: string;
    brand: string | null;
    group: string | null;
    sourceLabel: string;
    nutrients: NutrientValue[];
  };
  portions: FoodPortion[];
  clinical: {
    profile: FoodClinicalProfile;
    editable: boolean;
    message: string | null;
  };
};

type EditableTrait = {
  code: FoodClinicalTraitCode;
  relation: FoodClinicalTraitRelation | "";
};

type NewFoodForm = {
  source: "CUSTOM" | "MANUFACTURER";
  name: string;
  brand: string;
  energy_kcal: string;
  protein_g: string;
  carbohydrate_g: string;
  fat_g: string;
  fiber_g: string;
};

const sourceFilters: Array<{ value: "ALL" | FoodSource; label: string; empty: string }> = [
  { value: "ALL", label: "Todos", empty: "Nenhum alimento encontrado." },
  { value: "TACO", label: "TACO", empty: "Nenhum alimento TACO encontrado." },
  { value: "COMPLEMENTARY", label: "Complementar", empty: "Nenhum alimento complementar encontrado." },
  { value: "USDA", label: "USDA", empty: "Nenhum alimento USDA encontrado." },
  { value: "CUSTOM", label: "Personalizados", empty: "Nenhum alimento personalizado encontrado." },
  { value: "MANUFACTURER", label: "Fabricantes", empty: "Nenhum alimento de fabricante encontrado." },
];

const sourceBadgeClass: Record<FoodSource, string> = {
  TACO: "border-[#CFE0C9] bg-[#F0F7ED] text-[#4F6847]",
  COMPLEMENTARY: "border-[#D6E0EE] bg-[#F2F7FC] text-[#4E6683]",
  USDA: "border-[#E3D9F1] bg-[#F7F1FD] text-[#725797]",
  CUSTOM: "border-[#F0D6B8] bg-[#FFF5E8] text-[#8C5F2D]",
  MANUFACTURER: "border-[#E7D4CC] bg-[#FFF1EC] text-[#8A5748]",
};

const relationLabels: Record<FoodClinicalTraitRelation, string> = {
  contains: "Contem",
  may_contain: "Pode conter",
  free_from: "Livre de",
};

const macroCodes = new Set(["ENERGY_KCAL", "PROTEIN", "CARBOHYDRATE", "TOTAL_FAT", "FIBER"]);
const emptyNewFood: NewFoodForm = {
  source: "CUSTOM",
  name: "",
  brand: "",
  energy_kcal: "",
  protein_g: "",
  carbohydrate_g: "",
  fat_g: "",
  fiber_g: "",
};

export default function FoodsPage() {
  const [foods, setFoods] = useState<FoodSearchItem[]>([]);
  const [search, setSearch] = useState("arroz");
  const [source, setSource] = useState<"ALL" | FoodSource>("ALL");
  const [selectedRef, setSelectedRef] = useState<FoodReference | null>(null);
  const [detail, setDetail] = useState<FoodDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditableTrait[]>([]);
  const [showNewFood, setShowNewFood] = useState(false);
  const [newFood, setNewFood] = useState<NewFoodForm>(emptyNewFood);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");

  const loadFoods = useCallback(async (signal?: AbortSignal) => {
    const query = search.trim();
    if (query.length < 2) {
      setFoods([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ q: query, limit: "24" });
    if (source !== "ALL") params.set("source", source);
    try {
      const response = await fetch(`/api/admin/foods/search?${params}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel buscar alimentos.");
      setFoods(data.items ?? []);
    } catch (cause) {
      if ((cause as Error).name === "AbortError") return;
      setFoods([]);
      setError(cause instanceof Error ? cause.message : "Nao foi possivel buscar alimentos.");
    } finally {
      setLoading(false);
    }
  }, [search, source]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadFoods(controller.signal), 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [loadFoods]);

  async function loadDetail(ref: FoodReference) {
    setSelectedRef(ref);
    setDetail(null);
    setDetailError("");
    setEditing(false);
    setDetailLoading(true);
    const params = new URLSearchParams({ source: ref.source, sourceId: ref.sourceId });
    try {
      const response = await fetch(`/api/admin/foods/detail?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel carregar o detalhe.");
      setDetail(data);
      setDraft(toDraft(data.clinical.profile.traits));
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Nao foi possivel carregar o detalhe.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveProfile() {
    if (!detail || !detail.clinical.editable) return;
    setSaving(true);
    setDetailError("");
    try {
      const traits = draft
        .filter((trait) => trait.relation)
        .map((trait) => ({
          code: trait.code,
          relation: trait.relation,
          provenance: "PROFESSIONAL",
          evidenceText: "Configurado manualmente no perfil clinico do alimento.",
        }));
      const response = await fetch(`/api/admin/custom-foods/${detail.food.ref.sourceId}/clinical-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traits }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel salvar o perfil clinico.");
      await loadDetail(detail.food.ref);
      setDraft(toDraft(data.profile.traits));
      setEditing(false);
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Nao foi possivel salvar o perfil clinico.");
    } finally {
      setSaving(false);
    }
  }

  async function createFood() {
    setCreating(true);
    setError("");
    try {
      const payload = {
        name: newFood.name.trim(),
        brand: newFood.brand.trim() || null,
        source: newFood.source,
        energy_kcal: parseNumber(newFood.energy_kcal),
        protein_g: parseNumber(newFood.protein_g),
        carbohydrate_g: parseNumber(newFood.carbohydrate_g),
        fat_g: parseNumber(newFood.fat_g),
        fiber_g: newFood.fiber_g.trim() ? parseNumber(newFood.fiber_g) : null,
      };
      const response = await fetch("/api/admin/custom-foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel criar o alimento.");
      setNewFood(emptyNewFood);
      setShowNewFood(false);
      setSearch(data.name);
      setSource(data.source);
      await loadDetail({ source: data.source, sourceId: data.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel criar o alimento.");
    } finally {
      setCreating(false);
    }
  }

  const selectedGroups = useMemo(() => groupTraits(detail?.clinical.profile.traits ?? []), [detail]);
  const activeEmptyText = sourceFilters.find((item) => item.value === source)?.empty ?? "Nenhum alimento encontrado.";
  const macros = detail?.food.nutrients.filter((nutrient) => macroCodes.has(nutrient.code)) ?? [];
  const micros = detail?.food.nutrients.filter((nutrient) => !macroCodes.has(nutrient.code) && nutrient.value !== null) ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-up">
      <section className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <p className="brand-kicker mb-3">Base alimentar</p>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="font-serif text-4xl font-semibold text-[#3A3028]">Central de Alimentos</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#75675E]">
              Consulte alimentos, informacoes nutricionais, porcoes e perfis clinicos em todas as bases disponiveis.
            </p>
          </div>
          <button type="button" onClick={() => setShowNewFood((value) => !value)} className="brand-btn-primary w-full md:w-auto">
            {showNewFood ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showNewFood ? "Fechar" : "Novo alimento"}
          </button>
        </div>
      </section>

      {showNewFood && (
        <section className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <label className="space-y-1">
              <span className="brand-label">Tipo</span>
              <select value={newFood.source} onChange={(event) => setNewFood({ ...newFood, source: event.target.value as NewFoodForm["source"] })} className="brand-input">
                <option value="CUSTOM">Personalizado</option>
                <option value="MANUFACTURER">Fabricante</option>
              </select>
            </label>
            <label className="space-y-1 lg:col-span-2">
              <span className="brand-label">Nome</span>
              <input value={newFood.name} onChange={(event) => setNewFood({ ...newFood, name: event.target.value })} className="brand-input" />
            </label>
            <label className="space-y-1">
              <span className="brand-label">Marca</span>
              <input value={newFood.brand} onChange={(event) => setNewFood({ ...newFood, brand: event.target.value })} className="brand-input" />
            </label>
            <MacroInput label="kcal/100g" value={newFood.energy_kcal} onChange={(value) => setNewFood({ ...newFood, energy_kcal: value })} />
            <MacroInput label="Proteina" value={newFood.protein_g} onChange={(value) => setNewFood({ ...newFood, protein_g: value })} />
            <MacroInput label="Carboidrato" value={newFood.carbohydrate_g} onChange={(value) => setNewFood({ ...newFood, carbohydrate_g: value })} />
            <MacroInput label="Gordura" value={newFood.fat_g} onChange={(value) => setNewFood({ ...newFood, fat_g: value })} />
            <MacroInput label="Fibras" value={newFood.fiber_g} onChange={(value) => setNewFood({ ...newFood, fiber_g: value })} />
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => void createFood()} disabled={creating || !newFood.name.trim()} className="brand-btn-primary">
              <Save className="h-4 w-4" />
              {creating ? "Criando..." : "Criar alimento"}
            </button>
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <section className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5">
          <label htmlFor="food-search" className="brand-label">Buscar alimento</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
            <input id="food-search" value={search} onChange={(event) => setSearch(event.target.value)} className="brand-input brand-input-with-icon" placeholder="arroz, rice, salmon..." />
          </div>

          <div className="mt-4 flex flex-wrap gap-2" aria-label="Filtros de fonte">
            {sourceFilters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setSource(item.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${source === item.value ? "border-[#8C6E52] bg-[#8C6E52] text-white" : "border-[#EDE1D6] bg-white text-[#75675E] hover:bg-[#FBF7F1]"}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {error && <Message tone="error" text={error} />}

          <div className="mt-4 divide-y divide-[#EDE1D6]">
            {loading ? (
              <p className="flex items-center gap-2 py-6 text-sm text-[#75675E]"><Loader2 className="h-4 w-4 animate-spin" /> Buscando...</p>
            ) : !search.trim() || search.trim().length < 2 ? (
              <p className="py-6 text-sm text-[#75675E]">Digite pelo menos 2 caracteres para buscar nas bases.</p>
            ) : foods.length ? foods.map((food) => (
              <button
                key={`${food.ref.source}:${food.ref.sourceId}`}
                type="button"
                onClick={() => void loadDetail(food.ref)}
                className={`flex w-full items-start justify-between gap-3 px-2 py-3 text-left transition hover:bg-[#FBF7F1] ${sameRef(selectedRef, food.ref) ? "bg-[#FBF7F1]" : ""}`}
              >
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-[#3A3028]">{food.name}</strong>
                  <span className="mt-1 block text-xs text-[#75675E]">{[food.brand, food.group].filter(Boolean).join(" · ") || "Sem marca informada"}</span>
                  <span className="mt-2 flex flex-wrap gap-3 text-xs text-[#75675E]">
                    <NutrientInline label="kcal" value={food.energyKcal} unit="" />
                    <NutrientInline label="P" value={food.proteinG} unit="g" />
                    <NutrientInline label="C" value={food.carbohydrateG} unit="g" />
                    <NutrientInline label="G" value={food.fatG} unit="g" />
                  </span>
                </span>
                <SourceBadge source={food.ref.source} label={food.sourceLabel} />
              </button>
            )) : (
              <p className="py-6 text-sm text-[#75675E]">{activeEmptyText}</p>
            )}
          </div>
        </section>

        <aside className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="brand-kicker">Detalhe do alimento</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#3A3028]">{detail?.food.name ?? "Selecione um alimento"}</h2>
            </div>
            {detail && <SourceBadge source={detail.food.ref.source} label={detail.food.sourceLabel} />}
          </div>

          {detailLoading && <p className="mt-5 flex items-center gap-2 text-sm text-[#75675E]"><Loader2 className="h-4 w-4 animate-spin" /> Carregando detalhe...</p>}
          {detailError && <Message tone="error" text={detailError} />}
          {!selectedRef && !detailLoading && (
            <p className="mt-5 text-sm leading-6 text-[#75675E]">Escolha um resultado para ver macros, micronutrientes, porcoes e perfil clinico.</p>
          )}
          {selectedRef && !detail && !detailLoading && !detailError && (
            <Message tone="info" text="Nenhum detalhe encontrado para esta referencia." />
          )}

          {detail && (
            <div className="mt-5 space-y-5">
              <section className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-4">
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#8C6E52]">Informacoes gerais</h3>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <InfoTerm label="Nome" value={detail.food.name} />
                  <InfoTerm label="Marca" value={detail.food.brand ?? "Sem informacao"} />
                  <InfoTerm label="Source" value={detail.food.ref.source} />
                  <InfoTerm label="SourceId" value={detail.food.ref.sourceId} mono />
                </dl>
              </section>

              <NutrientSection title="Macronutrientes" nutrients={macros} showMissing />
              <NutrientSection title="Micronutrientes" nutrients={micros} emptyText="Sem micronutrientes informados para esta fonte." />

              <section>
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#8C6E52]">Porcoes</h3>
                {detail.portions.length ? (
                  <div className="mt-3 grid gap-2">
                    {detail.portions.map((portion) => (
                      <div key={portion.id} className="rounded-xl border border-[#EDE1D6] px-3 py-2 text-sm text-[#3A3028]">
                        <strong>{portion.label}</strong>
                        <span className="ml-2 text-xs text-[#75675E]">{formatNullable(portion.gramWeight)} g · {portion.confidence}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-sm text-[#75675E]">Sem medidas caseiras cadastradas.</p>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#8C6E52]">Perfil clinico</h3>
                    <p className="mt-1 text-xs text-[#75675E]">{detail.clinical.editable ? "Editavel para esta fonte." : "Somente leitura para esta fonte."}</p>
                  </div>
                  {detail.clinical.editable && (
                    <button type="button" onClick={() => setEditing((value) => !value)} className="brand-btn-secondary">
                      {editing ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                      {editing ? "Cancelar" : "Editar"}
                    </button>
                  )}
                </div>

                {detail.clinical.message && <Message tone="info" text={detail.clinical.message} />}

                {editing && detail.clinical.editable ? (
                  <div className="mt-4 space-y-3">
                    {draft.map((trait) => (
                      <div key={trait.code} className="grid grid-cols-[minmax(0,1fr)_150px] gap-2">
                        <span className="flex min-h-11 items-center rounded-xl bg-[#FBF7F1] px-3 text-sm font-medium text-[#3A3028]">
                          {FOOD_CLINICAL_TRAIT_LABELS[trait.code]}
                        </span>
                        <select
                          value={trait.relation}
                          onChange={(event) => setDraft((items) => items.map((item) => item.code === trait.code ? { ...item, relation: event.target.value as EditableTrait["relation"] } : item))}
                          className="brand-input"
                        >
                          <option value="">Sem dado</option>
                          {FOOD_CLINICAL_TRAIT_RELATIONS.map((relation) => <option key={relation} value={relation}>{relationLabels[relation]}</option>)}
                        </select>
                      </div>
                    ))}
                    <button type="button" onClick={() => void saveProfile()} disabled={saving} className="brand-btn-primary w-full">
                      <Save className="h-4 w-4" />
                      {saving ? "Salvando..." : "Salvar perfil"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <TraitGroup title="Contem" traits={selectedGroups.contains} />
                    <TraitGroup title="Pode conter" traits={selectedGroups.may_contain} />
                    <TraitGroup title="Livre de" traits={selectedGroups.free_from} />
                    {!detail.clinical.profile.traits.length && !detail.clinical.message && (
                      <div className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-sm leading-6 text-[#75675E]">
                        Sem perfil clinico estruturado. A classificacao de seguranca permanece unknown.
                      </div>
                    )}
                    {!!detail.clinical.profile.traits.length && (
                      <p className="flex items-center gap-2 text-xs text-[#75675E]">
                        <ShieldCheck className="h-4 w-4 text-[#607A56]" />
                        Traits exibidos sem transformar unknown em safe.
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function parseNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) throw new Error("Informe valores nutricionais numericos.");
  return parsed;
}

function sameRef(left: FoodReference | null, right: FoodReference) {
  return left?.source === right.source && left.sourceId === right.sourceId;
}

function toDraft(traits: FoodClinicalTrait[]): EditableTrait[] {
  return FOOD_CLINICAL_TRAIT_CODES.map((code) => ({
    code,
    relation: traits.find((trait) => trait.code === code)?.relation ?? "",
  }));
}

function groupTraits(traits: FoodClinicalTrait[]): Record<FoodClinicalTraitRelation, FoodClinicalTrait[]> {
  return {
    contains: traits.filter((trait) => trait.relation === "contains"),
    may_contain: traits.filter((trait) => trait.relation === "may_contain"),
    free_from: traits.filter((trait) => trait.relation === "free_from"),
  };
}

function formatNullable(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined) return "Sem informacao";
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: fractionDigits });
}

function SourceBadge({ source, label }: { source: FoodSource; label: string }) {
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${sourceBadgeClass[source]}`}>
      {label}
    </span>
  );
}

function NutrientInline({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return <span>{label}: <strong>{value === null ? "sem info" : `${formatNullable(value)}${unit}`}</strong></span>;
}

function InfoTerm({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[#A9978A]">{label}</dt>
      <dd className={`mt-1 break-words text-[#3A3028] ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function NutrientSection({ title, nutrients, showMissing = false, emptyText }: { title: string; nutrients: NutrientValue[]; showMissing?: boolean; emptyText?: string }) {
  const visible = showMissing ? nutrients : nutrients.filter((nutrient) => nutrient.value !== null);
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#8C6E52]">{title}</h3>
      {visible.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visible.map((nutrient) => (
            <div key={nutrient.code} className="rounded-xl border border-[#EDE1D6] bg-white px-3 py-2">
              <p className="text-xs text-[#75675E]">{nutrient.label}</p>
              <p className="mt-1 text-sm font-semibold text-[#3A3028]">
                {nutrient.value === null ? "Sem informacao" : `${formatNullable(nutrient.value)} ${nutrient.unit}`}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-sm text-[#75675E]">{emptyText ?? "Sem dados para exibir."}</p>
      )}
    </section>
  );
}

function MacroInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="brand-label">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" className="brand-input" />
    </label>
  );
}

function TraitGroup({ title, traits }: { title: string; traits: FoodClinicalTrait[] }) {
  if (!traits.length) return null;
  return (
    <section>
      <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-[#8C6E52]">{title}</h4>
      <div className="mt-2 flex flex-wrap gap-2">
        {traits.map((trait) => (
          <span key={trait.code} className="rounded-full border border-[#EDE1D6] bg-[#FBF7F1] px-3 py-1.5 text-xs font-semibold text-[#3A3028]">
            {FOOD_CLINICAL_TRAIT_LABELS[trait.code]}
          </span>
        ))}
      </div>
    </section>
  );
}

function Message({ tone, text }: { tone: "error" | "info"; text: string }) {
  const classes = tone === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-[#D6E0EE] bg-[#F2F7FC] text-[#4E6683]";
  return (
    <p className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${classes}`}>
      {tone === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <Database className="mt-0.5 h-4 w-4 shrink-0" />}
      {text}
    </p>
  );
}
