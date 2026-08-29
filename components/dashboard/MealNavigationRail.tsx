"use client";

import { useEffect, useState } from "react";

export type MealNavEntry = { index: number; name: string; time: string | null };

/**
 * R6.5.2 (seções 7, 11-13) — deriva a lista de navegação diretamente de
 * `meals`, sem estado próprio: refeição adicionada/excluída/reordenada
 * atualiza a navegação automaticamente porque não há cópia divergente.
 */
export function deriveMealNavEntries(meals: Array<{ name: string; suggested_time?: string | null }>): MealNavEntry[] {
  return meals.map((meal, index) => ({
    index,
    name: meal.name?.trim() || `Refeição ${index + 1}`,
    time: meal.suggested_time?.trim() || null,
  }));
}

function mealCardId(index: number) {
  return `meal-card-${index}`;
}

export function MealNavigationRail({ meals }: { meals: Array<{ name: string; suggested_time?: string | null }> }) {
  const entries = deriveMealNavEntries(meals);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = entries
      .map((entry) => document.getElementById(mealCardId(entry.index)))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    const visibility = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) visibility.set(record.target, record.intersectionRatio);
        let bestElement: Element | null = null;
        let bestRatio = 0;
        for (const element of elements) {
          const ratio = visibility.get(element) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestElement = element;
          }
        }
        if (bestElement) {
          const index = elements.indexOf(bestElement as HTMLElement);
          if (index >= 0) setActiveIndex(index);
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-96px 0px -55% 0px" }
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length, meals]);

  if (entries.length === 0) return null;

  return (
    <nav aria-label="Refeições" className="hidden 2xl:block 2xl:sticky 2xl:top-24 2xl:self-start">
      <ul className="space-y-1 rounded-xl border border-[#EDE1D6] bg-[#FFFDFC] p-2 text-sm">
        {entries.map((entry) => {
          const isActive = entry.index === activeIndex;
          return (
            <li key={entry.index}>
              <button
                type="button"
                aria-current={isActive ? "true" : undefined}
                onClick={() => document.getElementById(mealCardId(entry.index))?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  isActive ? "bg-[#F5EAD9] font-semibold text-[#3A3028]" : "text-[#75675E] hover:bg-[#FAF7F2]"
                }`}
              >
                {entry.time && <span className="shrink-0 text-[11px] tabular-nums text-[#9A6F5E]">{entry.time}</span>}
                <span className="truncate">{entry.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
