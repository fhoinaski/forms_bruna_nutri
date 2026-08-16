"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, Save, Search, ShieldCheck, X } from "lucide-react";
import {
  FOOD_CLINICAL_TRAIT_CODES,
  FOOD_CLINICAL_TRAIT_LABELS,
  FOOD_CLINICAL_TRAIT_RELATIONS,
  type FoodClinicalProfile,
  type FoodClinicalTrait,
  type FoodClinicalTraitCode,
  type FoodClinicalTraitRelation,
} from "@/lib/clinical/food-clinical-traits";

type CustomFood = {
  id: string;
  name: string;
  brand: string | null;
  source: "CUSTOM" | "MANUFACTURER";
  portion_base_grams: number;
  energy_kcal: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
};

type EditableTrait = {
  code: FoodClinicalTraitCode;
  relation: FoodClinicalTraitRelation | "";
};

const relationLabels: Record<FoodClinicalTraitRelation, string> = {
  contains: "Contem",
  may_contain: "Pode conter",
  free_from: "Livre de",
};

export default function FoodsPage() {
  const [foods, setFoods] = useState<CustomFood[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomFood | null>(null);
  const [profile, setProfile] = useState<FoodClinicalProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditableTrait[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadFoods = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const response = await fetch(`/api/admin/custom-foods?${params}`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json() as { items: CustomFood[] };
      setFoods(data.items);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadFoods(), 250);
    return () => window.clearTimeout(timer);
  }, [loadFoods]);

  async function loadProfile(food: CustomFood) {
    setSelected(food);
    setError("");
    setEditing(false);
    const response = await fetch(`/api/admin/custom-foods/${food.id}/clinical-profile`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message ?? "Nao foi possivel carregar o perfil clinico.");
      setProfile(null);
      return;
    }
    setProfile(data.profile);
    setDraft(toDraft(data.profile.traits));
  }

  async function saveProfile() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const traits = draft
        .filter((trait) => trait.relation)
        .map((trait) => ({
          code: trait.code,
          relation: trait.relation,
          provenance: "PROFESSIONAL",
          evidenceText: "Configurado manualmente no perfil clinico do alimento.",
        }));
      const response = await fetch(`/api/admin/custom-foods/${selected.id}/clinical-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traits }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel salvar o perfil clinico.");
      setProfile(data.profile);
      setDraft(toDraft(data.profile.traits));
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel salvar o perfil clinico.");
    } finally {
      setSaving(false);
    }
  }

  const selectedGroups = useMemo(() => groupTraits(profile?.traits ?? []), [profile]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-up">
      <section className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <p className="brand-kicker mb-3">Base alimentar</p>
        <h1 className="font-serif text-4xl font-semibold text-[#3A3028]">Alimentos personalizados</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
          Configure o perfil clinico de alimentos customizados e de fabricante. TACO curado pelo sistema permanece somente leitura.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5">
          <label className="brand-label">Buscar</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="brand-input brand-input-with-icon" placeholder="Nome ou marca..." />
          </div>
          <div className="mt-4 divide-y divide-[#EDE1D6]">
            {loading ? (
              <p className="py-6 text-sm text-[#75675E]">Carregando...</p>
            ) : foods.length ? foods.map((food) => (
              <button
                key={food.id}
                type="button"
                onClick={() => void loadProfile(food)}
                className={`flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-[#FBF7F1] ${selected?.id === food.id ? "bg-[#FBF7F1]" : ""}`}
              >
                <span className="min-w-0 px-2">
                  <strong className="block truncate text-sm text-[#3A3028]">{food.name}</strong>
                  <span className="text-xs text-[#75675E]">{food.brand || (food.source === "MANUFACTURER" ? "Fabricante" : "Customizado")}</span>
                </span>
                <span className="shrink-0 rounded-full border border-[#EDE1D6] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#8C6E52]">
                  {food.source === "MANUFACTURER" ? "Fabricante" : "Custom"}
                </span>
              </button>
            )) : (
              <p className="py-6 text-sm text-[#75675E]">Nenhum alimento customizado encontrado.</p>
            )}
          </div>
        </section>

        <aside className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="brand-kicker">Perfil clinico</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#3A3028]">{selected?.name ?? "Selecione um alimento"}</h2>
            </div>
            {selected && (
              <button type="button" onClick={() => setEditing((value) => !value)} className="brand-btn-secondary">
                {editing ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                {editing ? "Cancelar" : "Editar"}
              </button>
            )}
          </div>

          {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          {!selected ? (
            <p className="mt-5 text-sm leading-6 text-[#75675E]">Escolha um alimento para ver ou editar seus traits clinicos.</p>
          ) : editing ? (
            <div className="mt-5 space-y-3">
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
            <div className="mt-5 space-y-4">
              <TraitGroup title="Contem" traits={selectedGroups.contains} />
              <TraitGroup title="Pode conter" traits={selectedGroups.may_contain} />
              <TraitGroup title="Livre de" traits={selectedGroups.free_from} />
              {!profile?.traits.length && (
                <div className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-sm leading-6 text-[#75675E]">
                  Sem perfil clinico estruturado. A classificacao de seguranca permanece unknown.
                </div>
              )}
              {!!profile?.traits.length && (
                <p className="flex items-center gap-2 text-xs text-[#75675E]">
                  <ShieldCheck className="h-4 w-4 text-[#607A56]" />
                  Provenance registrada nos traits e no historico de alteracoes.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
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

function TraitGroup({ title, traits }: { title: string; traits: FoodClinicalTrait[] }) {
  if (!traits.length) return null;
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#8C6E52]">{title}</h3>
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
