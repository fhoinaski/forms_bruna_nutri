"use client";

import { MealPlanEditor } from "@/components/dashboard/MealPlanEditor";

/**
 * Plano alimentar (secao 11) — embute o MealPlanEditor existente tal como
 * esta, sem nenhuma mudanca. Alterar via linguagem natural continua
 * disponivel pelo Copiloto (Area C), que ja reaproveita 100% a proposta
 * meal_plan_change existente.
 */
export function ConsultationMealPlan({ clientId }: { clientId: string }) {
  return (
    <div className="rounded-2xl border border-[#EDE1D6] bg-white p-5">
      <h2 className="mb-3 font-serif text-lg font-semibold text-[#3A3028]">Plano alimentar</h2>
      <MealPlanEditor clientId={clientId} />
    </div>
  );
}
