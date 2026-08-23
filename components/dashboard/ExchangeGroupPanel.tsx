"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, X } from "lucide-react";

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
  same_group: number;
  state: "SUGGESTED" | "APPROVED" | "EDITED" | "REJECTED";
}

export interface ExchangeGroupView {
  id: string;
  food_group: string;
  food_subgroup: string;
  primary_food_name: string;
  primary_quantity_grams?: number | null;
  exchange_list_id?: string | null;
  exchange_generation_mode?: string | null;
}

type FoodSearchItem = {
  ref?: { source: "TACO" | "COMPLEMENTARY" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF"; sourceId: string; canonicalId?: string | null };
  descricao?: string;
  displayName?: string;
  name?: string;
  sourceLabel?: string;
  grupo?: string;
};

function friendlyFoodName(technicalName: string) {
  const parts = technicalName.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join(" ") : technicalName.trim();
}

function gramsLabel(value: number) {
  return `${Math.round(value * 10) / 10} g`;
}

function clinicalErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/NEEDS_FOOD_CONFIRMATION|confirme/i.test(message)) return "Confirme este alimento antes de gerar trocas.";
  if (/dados nutricionais|fonte sem cálculo|calcular/i.test(message)) return "Este alimento ainda não possui dados suficientes para calcular trocas.";
  return "Não foi possível gerar sugestões adequadas.";
}

export function ExchangeGroupPanel({
  clientId,
  mealPlanId,
  primaryFoodSource,
  primaryFoodRefId,
  primaryCanonicalFoodId,
  primaryFoodName,
  mealName,
  mealPlanItemId,
  primaryGrams,
  group,
  alternatives,
  onRefresh,
  onResolved,
}: {
  clientId: string;
  mealPlanId: string;
  mealPlanItemId?: string | null;
  primaryFoodName?: string | null;
  mealName?: string | null;
  primaryFoodSource: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF" | null | undefined;
  primaryFoodRefId: string | null | undefined;
  primaryCanonicalFoodId?: string | null;
  primaryGrams: number | null | undefined;
  group: ExchangeGroupView | null;
  alternatives: ExchangeAlternativeView[];
  onRefresh: () => void;
  onResolved?: (identity: { food_source: "TACO" | "CUSTOM" | "MANUFACTURER" | "USDA" | "TBCA" | "IBGE_POF"; food_ref_id: string; canonical_food_id: string | null }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [specificOpen, setSpecificOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [specificQuery, setSpecificQuery] = useState("");
  const [manualResults, setManualResults] = useState<FoodSearchItem[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const hasStructuredIdentity = Boolean(primaryFoodSource && primaryFoodRefId);
  const canTryResolve = Boolean(mealPlanItemId && primaryFoodName?.trim());
  const hasGrams = Number.isFinite(primaryGrams) && (primaryGrams ?? 0) > 0;
  const isStale = Boolean(group && hasGrams && typeof group.primary_quantity_grams === "number" && Math.abs(group.primary_quantity_grams - (primaryGrams ?? 0)) >= 0.1);
  const canGenerate = hasGrams && (hasStructuredIdentity || canTryResolve);

  const visible = alternatives.filter((a) => a.state !== "REJECTED");
  const approved = visible.filter((a) => a.state === "APPROVED");
  const suggestions = visible.filter((a) => a.state === "SUGGESTED" || a.state === "EDITED");
  const visibleSuggestions = expanded ? suggestions.slice(0, 8) : suggestions.slice(0, 3);
  const hiddenSuggestionCount = Math.max(0, suggestions.length - visibleSuggestions.length);
  const selectedVisible = Array.from(selected).filter((id) => suggestions.some((alt) => alt.id === id));
  const primaryLabel = `${primaryFoodName ? friendlyFoodName(primaryFoodName) : "Alimento principal"}${hasGrams ? ` - ${gramsLabel(primaryGrams ?? 0)}` : ""}`;

  const manualSearchLabel = useMemo(() => {
    if (!manualOpen) return "";
    if (!manualQuery.trim()) return "Digite para pesquisar no catálogo.";
    if (!manualResults.length) return "Nenhum alimento encontrado.";
    return `${manualResults.length} resultado(s)`;
  }, [manualOpen, manualQuery, manualResults.length]);

  useEffect(() => {
    if (!manualOpen || manualQuery.trim().length < 2) {
      setManualResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/foods/search?q=${encodeURIComponent(manualQuery.trim())}&limit=8`, { cache: "no-store", signal: controller.signal });
        const data = response.ok ? await response.json() as { items?: FoodSearchItem[] } : { items: [] };
        setManualResults(data.items ?? []);
      } catch (cause) {
        if (!(cause instanceof Error && cause.name === "AbortError")) setManualResults([]);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [manualOpen, manualQuery]);

  useEffect(() => {
    if (manualOpen) window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [manualOpen]);

  async function generate() {
    if (!canGenerate) {
      setError(!hasGrams ? "Este alimento ainda não possui dados suficientes para calcular trocas." : "Confirme este alimento antes de gerar trocas.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/exchange-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealPlanId,
          ...(hasStructuredIdentity
            ? {
                primaryFoodSource,
                primaryFoodRefId,
                primaryCanonicalFoodId: primaryCanonicalFoodId ?? null,
                ...(mealPlanItemId ? { mealPlanItemId } : {}),
              }
            : {
                mealPlanItemId,
                primaryFoodName,
              }),
          primaryQuantityGrams: primaryGrams,
          mealName: mealName ?? null,
          limit: 5,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code || data.message || "generation_failed");
      if (data.resolvedItem?.status === "RESOLVED") {
        onResolved?.({
          food_source: data.resolvedItem.food_source,
          food_ref_id: data.resolvedItem.food_ref_id,
          canonical_food_id: data.resolvedItem.canonical_food_id ?? null,
        });
      }
      setSelected(new Set());
      await onRefresh();
    } catch (cause) {
      setError(clinicalErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function patchGroup(body: Record<string, unknown>) {
    if (!group) return null;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/exchange-groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível atualizar trocas.");
      await onRefresh();
      return data;
    } catch (cause) {
      setError(clinicalErrorMessage(cause));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function approveSelected() {
    if (!selectedVisible.length) return;
    await patchGroup({ action: "approve", alternativeIds: selectedVisible });
    setSelected(new Set());
  }

  async function removeOrReject(alternativeId: string) {
    await patchGroup({ action: "reject", alternativeId });
    setSelected((current) => {
      const next = new Set(current);
      next.delete(alternativeId);
      return next;
    });
  }

  async function addManual(item: FoodSearchItem) {
    if (!item.ref || !group) return;
    const data = await patchGroup({
      action: "add_manual",
      source: item.ref.source,
      sourceId: item.ref.sourceId,
      canonicalId: item.ref.canonicalId ?? null,
    });
    if (data) {
      setManualOpen(false);
      setManualQuery("");
      setManualResults([]);
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

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-[#EAD8C2] bg-[#FFFDFC] p-4">
        <p className="brand-kicker">Trocas</p>
        <h3 className="mt-1 font-serif text-xl font-semibold text-[#3A3028]">Alimento principal</h3>
        <p className="mt-1 text-sm font-semibold text-[#3A3028]">{primaryLabel}</p>
        {mealName && <p className="mt-0.5 text-xs text-[#75675E]">{mealName}</p>}
      </section>

      {isStale && (
        <section className="rounded-xl border border-[#F0D4B8] bg-[#FFF8F0] p-4">
          <p className="text-sm font-semibold text-[#7A5420]">Trocas precisam ser atualizadas.</p>
          <p className="mt-1 text-xs leading-5 text-[#8C6E52]">A prescrição do alimento principal mudou desde o último cálculo.</p>
          <button type="button" onClick={generate} disabled={loading || !canGenerate} className="brand-btn-secondary mt-3">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar trocas
          </button>
        </section>
      )}

      {error && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={generate} disabled={loading || !canGenerate} className="brand-btn-secondary">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Tentar novamente
            </button>
            {group && (
              <button type="button" onClick={() => setManualOpen(true)} className="brand-btn-secondary">
                <Plus className="h-4 w-4" />
                Adicionar manualmente
              </button>
            )}
          </div>
        </section>
      )}

      {!group && !error && (
        <section className="rounded-xl border border-[#EDE1D6] bg-white p-4">
          <p className="text-sm font-semibold text-[#3A3028]">Nenhuma troca cadastrada.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={generate} disabled={loading || !canGenerate} className="brand-btn-primary">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Gerar sugestões
            </button>
            <button type="button" onClick={() => setManualOpen(true)} disabled={!group} className="brand-btn-secondary">
              <Plus className="h-4 w-4" />
              Adicionar manualmente
            </button>
          </div>
        </section>
      )}

      {group && (
        <>
          <ExchangeListSection
            title="Aprovadas"
            emptyText="Nenhuma troca aprovada."
            alternatives={approved}
            loading={loading}
            mode="approved"
            selected={selected}
            onToggle={toggle}
            onRemove={removeOrReject}
          />

          <ExchangeListSection
            title="Sugestões"
            emptyText="Nenhuma sugestão para revisar."
            alternatives={visibleSuggestions}
            loading={loading}
            mode="suggested"
            selected={selected}
            onToggle={toggle}
            onRemove={removeOrReject}
          />

          {hiddenSuggestionCount > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className="text-xs font-semibold text-[#607A56] hover:underline">
              Ver mais
            </button>
          )}
          {expanded && suggestions.length > 3 && (
            <button type="button" onClick={() => setExpanded(false)} className="ml-3 text-xs font-semibold text-[#607A56] hover:underline">
              Ver menos
            </button>
          )}

          {selectedVisible.length > 0 && (
            <button type="button" onClick={approveSelected} disabled={loading} className="brand-btn-primary">
              <Check className="h-4 w-4" />
              Aprovar selecionadas
            </button>
          )}

          <div className="space-y-3 border-t border-[#EDE1D6] pt-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setManualOpen((current) => !current)} className="brand-btn-secondary">
                <Plus className="h-4 w-4" />
                Adicionar outra
              </button>
              <button type="button" onClick={generate} disabled={loading || !canGenerate} className="brand-btn-secondary">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Gerar outras sugestões
              </button>
              <button type="button" onClick={() => setSpecificOpen((current) => !current)} className="inline-flex min-h-10 items-center justify-center rounded-full px-3 text-xs font-semibold text-[#75675E] hover:bg-[#FBF7F1]">
                Pedir sugestão específica
              </button>
            </div>

            {manualOpen && (
              <div className="rounded-xl border border-[#EDE1D6] bg-[#FAF7F2]/60 p-3">
                <label className="brand-label" htmlFor="exchange-manual-search">Pesquisar alimento</label>
                <div className="mt-1 flex items-center gap-2">
                  <Search className="h-4 w-4 shrink-0 text-[#75675E]" />
                  <input
                    ref={searchInputRef}
                    id="exchange-manual-search"
                    value={manualQuery}
                    onChange={(event) => setManualQuery(event.target.value)}
                    className="brand-input"
                    placeholder="Ex.: mandioca, arroz branco..."
                  />
                </div>
                <p className="mt-2 text-xs text-[#75675E]">{manualSearchLabel}</p>
                {manualResults.length > 0 && (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[#EAD8C2] bg-white p-1">
                    {manualResults.map((item, index) => {
                      const label = item.displayName ?? item.name ?? item.descricao ?? "Alimento";
                      return (
                        <button
                          key={`${item.ref?.source ?? "food"}:${item.ref?.sourceId ?? index}`}
                          type="button"
                          onClick={() => void addManual(item)}
                          disabled={loading || !item.ref}
                          className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[#FAF7F2] disabled:opacity-50"
                        >
                          <span className="block text-sm font-semibold text-[#3A3028]">{label}</span>
                          <span className="mt-0.5 block text-[10px] uppercase tracking-[0.08em] text-[#8C6E52]">{item.sourceLabel ?? item.grupo ?? "Catálogo"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {specificOpen && (
              <div className="rounded-xl border border-[#EDE1D6] bg-white p-3">
                <label className="brand-label" htmlFor="exchange-specific-request">Sugestão específica</label>
                <input
                  id="exchange-specific-request"
                  value={specificQuery}
                  onChange={(event) => setSpecificQuery(event.target.value)}
                  className="brand-input mt-1"
                  placeholder="Ex.: quero uma opção sem glúten"
                />
                <p className="mt-2 text-xs leading-5 text-[#75675E]">A busca usa o catálogo real; a quantidade continua sendo calculada pelo sistema.</p>
                <button
                  type="button"
                  disabled={!specificQuery.trim()}
                  onClick={() => {
                    setManualOpen(true);
                    setManualQuery(specificQuery);
                  }}
                  className="brand-btn-secondary mt-3"
                >
                  <Search className="h-4 w-4" />
                  Buscar opções
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ExchangeListSection({
  title,
  emptyText,
  alternatives,
  loading,
  mode,
  selected,
  onToggle,
  onRemove,
}: {
  title: string;
  emptyText: string;
  alternatives: ExchangeAlternativeView[];
  loading: boolean;
  mode: "approved" | "suggested";
  selected: Set<string>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-[#EDE1D6] bg-white p-4">
      <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#607A56]">{title}</h4>
      {alternatives.length ? (
        <ul className="mt-2 space-y-1.5">
          {alternatives.map((alt) => (
            <li key={alt.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-[#FAF7F2]/70 px-3 py-2">
              {mode === "suggested" ? (
                <label className="flex min-w-0 items-center gap-2">
                  <input type="checkbox" checked={selected.has(alt.id)} onChange={() => onToggle(alt.id)} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate text-sm font-semibold text-[#3A3028]">{friendlyFoodName(alt.food_name)}</span>
                </label>
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-[#607A56]" aria-hidden="true" />
                  <span className="min-w-0 truncate text-sm font-semibold text-[#3A3028]">{friendlyFoodName(alt.food_name)}</span>
                </span>
              )}
              <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[#3A3028]">
                {gramsLabel(alt.quantity_grams)}
                <button
                  type="button"
                  onClick={() => onRemove(alt.id)}
                  disabled={loading}
                  className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-[11px] font-semibold text-[#8C5F50] hover:bg-[#FFF3E9] disabled:opacity-50"
                  aria-label={mode === "approved" ? `Remover ${friendlyFoodName(alt.food_name)}` : `Rejeitar ${friendlyFoodName(alt.food_name)}`}
                >
                  {mode === "approved" ? "Remover" : <><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Rejeitar</span></>}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[#75675E]">{emptyText}</p>
      )}
    </section>
  );
}
