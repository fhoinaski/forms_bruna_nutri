"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";

/**
 * FASE 7 (item 14) — painel de GRUPO DE TROCA por item do plano. Gera
 * alternativas via o motor determinístico (endpoint
 * /exchange-groups, nunca a IA calculando), mostra até 5 opções em estado
 * SUGGESTED, e só marca APPROVED quando a nutricionista clica "Aprovar
 * selecionadas" — nenhuma alternativa aparece ao paciente antes disso
 * (ver lib/repositories/client-portal.ts, item 22).
 */

export interface ExchangeAlternativeView {
  id: string;
  food_name: string;
  quantity_grams: number;
  energy_kcal: number | null;
  protein_g: number | null;
  carbohydrate_g: number | null;
  fat_g: number | null;
  quality: string | null;
  same_subgroup: number;
  state: "SUGGESTED" | "APPROVED" | "EDITED" | "REJECTED";
}

export interface ExchangeGroupView {
  id: string;
  food_group: string;
  food_subgroup: string;
  primary_food_name: string;
}

const QUALITY_LABEL: Record<string, string> = { EXCELLENT: "Excelente", GOOD: "Boa", REVIEW: "Revisar", UNSUITABLE: "Não recomendado" };

function friendlyFoodName(technicalName: string) {
  const parts = technicalName.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join(" ") : technicalName.trim();
}

export function ExchangeGroupPanel({
  clientId,
  mealPlanId,
  primaryFoodSource,
  primaryFoodRefId,
  primaryCanonicalFoodId,
  primaryGrams,
  group,
  alternatives,
  onRefresh,
}: {
  clientId: string;
  mealPlanId: string;
  primaryFoodSource: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF" | null | undefined;
  primaryFoodRefId: string | null | undefined;
  primaryCanonicalFoodId?: string | null;
  primaryGrams: number | null | undefined;
  group: ExchangeGroupView | null;
  alternatives: ExchangeAlternativeView[];
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const canGenerate = Boolean(primaryFoodSource && primaryFoodRefId) && Number.isFinite(primaryGrams) && (primaryGrams ?? 0) > 0;

  async function generate() {
    if (!canGenerate) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/exchange-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealPlanId,
          primaryFoodSource,
          primaryFoodRefId,
          primaryCanonicalFoodId: primaryCanonicalFoodId ?? null,
          primaryQuantityGrams: primaryGrams,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível gerar substituições.");
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar substituições.");
    } finally {
      setLoading(false);
    }
  }

  async function approveSelected() {
    if (!group || !selected.size) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/exchange-groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", alternativeIds: Array.from(selected) }),
      });
      if (!response.ok) throw new Error((await response.json()).message ?? "Não foi possível aprovar.");
      setSelected(new Set());
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível aprovar.");
    } finally {
      setLoading(false);
    }
  }

  async function reject(alternativeId: string) {
    if (!group) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/exchange-groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", alternativeId }),
      });
      if (!response.ok) throw new Error((await response.json()).message ?? "Não foi possível rejeitar.");
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível rejeitar.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visible = alternatives.filter((a) => a.state !== "REJECTED");

  return (
    <div className="mt-2 rounded-xl border border-[#EAD8C2] bg-[#FFFDFC] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#3A3028]">Grupo de troca</p>
          {group && <p className="text-[10px] uppercase tracking-[0.06em] text-[#8C6E52]">{group.food_group} / {group.food_subgroup}</p>}
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate || loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#EEF3EA] px-2.5 text-xs font-semibold text-[#607A56] hover:bg-[#E1EAD8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {group ? "Regenerar sugestões" : "Gerar substituições"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {!group && !error && <p className="mt-2 text-xs text-[#8C6E52]">Nenhum grupo de troca gerado ainda pra este alimento.</p>}
      {visible.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {visible.map((alt) => (
            <li key={alt.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-sm">
              <label className="flex flex-1 items-center gap-2">
                {alt.state === "SUGGESTED" || alt.state === "EDITED" ? (
                  <input type="checkbox" checked={selected.has(alt.id)} onChange={() => toggle(alt.id)} className="h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4 text-[#607A56]" aria-label="Aprovado" />
                )}
                <span className="text-[#3A3028]">{friendlyFoodName(alt.food_name)}</span>
                <span className="text-xs text-[#8C6E52]">{Math.round(alt.quantity_grams)} g</span>
                {alt.quality && <span className="text-[10px] uppercase tracking-[0.05em] text-[#9A8B80]">{QUALITY_LABEL[alt.quality] ?? alt.quality}</span>}
                {Boolean(alt.same_subgroup) && <span className="rounded-full bg-[#EEF3EA] px-1.5 py-0.5 text-[9px] font-semibold text-[#607A56]">mesmo subgrupo</span>}
                {alt.state === "APPROVED" && <span className="text-[10px] font-semibold uppercase text-[#607A56]">aprovado</span>}
              </label>
              {alt.state !== "APPROVED" && (
                <button type="button" onClick={() => reject(alt.id)} disabled={loading} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-red-500 hover:bg-red-50" aria-label="Rejeitar alternativa">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {selected.size > 0 && (
        <button type="button" onClick={approveSelected} disabled={loading} className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#607A56] px-3 text-xs font-semibold text-white hover:bg-[#547049] disabled:opacity-50">
          <Check className="h-3.5 w-3.5" />
          Aprovar selecionadas ({selected.size})
        </button>
      )}
    </div>
  );
}
