import { useEffect, useState } from "react";
import type { MacroReferenceFood } from "@/lib/nutrition/macros";

export type FoodSuggestion = MacroReferenceFood & { numero: number | string; grupo: string };

/**
 * Busca de alimentos com debounce + cancelamento via AbortController, para
 * qualquer campo que precise de autocomplete contra /api/admin/foods/search
 * (ex.: alimentos de substituicoes). So dispara a partir de `minLength`
 * caracteres uteis, espelhando o gate do proprio endpoint
 * (lib/nutrition/food-search.ts) para nao gerar requests inuteis.
 */
export function useDebouncedFoodSearch(query: string, options?: { minLength?: number; debounceMs?: number }) {
  const minLength = options?.minLength ?? 2;
  const debounceMs = options?.debounceMs ?? 300;
  const [results, setResults] = useState<FoodSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < minLength) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/admin/foods/search?q=${encodeURIComponent(trimmed)}`, { cache: "no-store", signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { items: [] }))
        .then((data: { items?: FoodSuggestion[] }) => setResults(data.items ?? []))
        .catch((cause) => {
          if (cause instanceof Error && cause.name === "AbortError") return;
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, minLength, debounceMs]);

  return { results, loading };
}
