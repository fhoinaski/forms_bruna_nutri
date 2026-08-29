"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, Copy, Plus, Printer, Save, Sparkles, Trash2, XCircle } from "lucide-react";
import { MealItemsEditor, cleanMealsForSave, sanitizeMealForPlanClone, type Meal } from "@/components/dashboard/MealItemsEditor";
import type { ItemSubstitution } from "@/components/dashboard/ItemSubstitutionsPanel";
import { AiMealPlanWizard } from "@/components/dashboard/AiMealPlanWizard";
import { MealPlanNutritionWorkspacePanel } from "@/components/nutrition/MealPlanNutritionSummary";
import { MealNavigationRail } from "@/components/dashboard/MealNavigationRail";
import { useDebouncedFoodSearch, type FoodSuggestion } from "@/hooks/use-debounced-food-search";
import {
  PROTOCOL_TEMPLATE_GROUP_LABELS,
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  type ProtocolTemplateTargetGroup,
} from "@/lib/protocol-templates/constants";

type MealPlanStatus = "draft" | "active" | "archived";
type Substitution = ItemSubstitution;
type Supplement = { name: string; dosage?: string | null; unit?: string | null; instructions?: string | null; notes?: string | null };
type WeeklySlot = {
  weekday: number;
  meal_type: "almoco" | "jantar";
  title?: string | null;
  notes?: string | null;
  source_meal_id?: string | null;
};
type TemplateDraft = {
  title: string;
  targetGroup: ProtocolTemplateTargetGroup;
  error: string;
};
type TemplateImportPreview = {
  template: {
    title: string;
    origin: "SYSTEM" | "USER";
    version: number;
    targetGroup: ProtocolTemplateTargetGroup;
    mealCount: number;
    itemCount: number;
  };
  hasConflicts: boolean;
  conflicts: Array<{ mealName: string; food: string; reason: string }>;
};
type MealPlan = {
  id: string;
  title: string;
  target_group: string | null;
  status: MealPlanStatus;
  version: number;
  notes: string | null;
  target_energy_kcal?: number | null;
  target_protein_g?: number | null;
  target_carbohydrate_g?: number | null;
  target_fat_g?: number | null;
  /** R6.5.4 (seção 89) — já vinha na API (MealPlanPayload), só não era lido pelo editor; usado pro rótulo "Última alteração". */
  updated_at?: string;
  meals: Meal[];
  weekly_slots: WeeklySlot[];
  substitutions: Substitution[];
  supplements: Supplement[];
};
type PublicationIssue = {
  code: string;
  severity: "ERROR" | "WARNING" | "INFO";
  blockPublishing: boolean;
  mealName?: string | null;
  foodName?: string | null;
  message: string;
};
type PublicationReview = {
  valid: boolean;
  blockers: PublicationIssue[];
  warnings: PublicationIssue[];
  summary: {
    meals: number;
    items: number;
    resolvedItems: number;
    approvedExchanges: number;
    staleExchanges: number;
    blockers: number;
    warnings: number;
  };
  nutritionSummary: {
    energyKcal: number | null;
    proteinG: number | null;
    carbohydrateG: number | null;
    fatG: number | null;
    fiberG: number | null;
    unresolvedItems: number;
  };
  mealSummary: Array<{ mealName: string; items: number; blockers: number; warnings: number }>;
};

/** R6.5.4 (seção 89) — mesma convenção de formatação de hora já usada em AiChatWidget.tsx. */
function formatPlanUpdatedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  } catch {
    return "";
  }
}

function editablePlanSignature(plan: MealPlan): string {
  return JSON.stringify({
    title: plan.title,
    status: plan.status,
    notes: plan.notes ?? null,
    target_energy_kcal: plan.target_energy_kcal ?? null,
    target_protein_g: plan.target_protein_g ?? null,
    target_carbohydrate_g: plan.target_carbohydrate_g ?? null,
    target_fat_g: plan.target_fat_g ?? null,
    meals: plan.meals,
    weekly_slots: plan.weekly_slots ?? [],
    substitutions: plan.substitutions,
    supplements: plan.supplements,
  });
}

export function MealPlanEditor({ clientId, onSaved }: { clientId: string; onSaved?: () => void }) {
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [savedPlanSignature, setSavedPlanSignature] = useState("");
  const [targetGroup, setTargetGroup] = useState<ProtocolTemplateTargetGroup>("ADULTO_SAUDAVEL");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optimizingPlan, setOptimizingPlan] = useState(false);
  const [optimizeSummary, setOptimizeSummary] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState("");
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const [deleteDraft, setDeleteDraft] = useState<{ planId: string; title: string; status: MealPlanStatus } | null>(null);
  const [publicationReview, setPublicationReview] = useState<PublicationReview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [warningsAccepted, setWarningsAccepted] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [aiWizardOpen, setAiWizardOpen] = useState(false);

  const loadPlans = useCallback(async (preferredPlanId?: string) => {
    const response = await fetch(`/api/admin/clients/${clientId}/meal-plans`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as MealPlan[];
    setPlans(data);
    const current = data.find((item) => item.id === preferredPlanId) ?? data[0] ?? null;
    setSelectedPlanId(current?.id ?? "");
    setPlan(current);
    setSavedPlanSignature(current ? editablePlanSignature(current) : "");
  }, [clientId]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    fetch("/api/admin/settings/ai", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((settings: { has_api_key?: boolean } | null) => setAiEnabled(Boolean(settings?.has_api_key)))
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!templateDraft && !deleteDraft && !reviewOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [templateDraft, deleteDraft, reviewOpen]);

  function selectPlan(id: string) {
    setSelectedPlanId(id);
    const selected = plans.find((item) => item.id === id) ?? null;
    setPlan(selected);
    setSavedPlanSignature(selected ? editablePlanSignature(selected) : "");
    setConflict("");
    setError("");
    setMessage("");
  }

  async function createFromTemplate() {
    setCreating(true);
    setError("");
    setMessage("");
    setConflict("");
    try {
      const previewResponse = await fetch(`/api/admin/clients/${clientId}/meal-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroup, previewOnly: true }),
      });
      const preview = await previewResponse.json() as TemplateImportPreview & { message?: string };
      if (!previewResponse.ok) throw new Error(preview.message ?? "Nao foi possivel validar o modelo.");
      if (preview.hasConflicts) {
        setError(`Este modelo contém ${preview.conflicts.length} item(ns) que precisam ser revisados antes de importar: ${preview.conflicts.slice(0, 3).map((item) => `${item.mealName}: ${item.food}`).join("; ")}.`);
        return;
      }
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroup, confirmed: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel criar o plano.");
      await loadPlans(data.id);
      setMessage(`Plano criado a partir do modelo ${preview.template.title} (${preview.template.origin}, v${preview.template.version}; ${preview.template.mealCount} refeicao(oes), ${preview.template.itemCount} item(ns)). Revise, personalize e ative quando estiver pronto.`);
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel criar o plano.");
    } finally {
      setCreating(false);
    }
  }

  /**
   * Cria um plano novo (fluxo ja existente de "criar por modelo") e, antes
   * do primeiro save, pre-preenche localmente refeicoes/substituicoes/
   * suplementos a partir do plano atualmente selecionado. Nenhum endpoint
   * novo: o backend sempre gera ids novos a cada save (meal-plans.ts), entao
   * duplicar e so uma copia estrutural em memoria que a nutricionista revisa
   * antes de persistir.
   *
   * R4 (seções 17-19) — cada refeição copiada passa por
   * `sanitizeMealForPlanClone`: nunca reaproveita `nutrition_snapshot`
   * antigo (mesmo que o objeto de origem o carregue em runtime), forçando
   * o preview de nutrição a recalcular pela identidade canônica atual já a
   * partir do instante da duplicação — não só no primeiro save.
   */
  async function duplicateCurrentPlan() {
    if (!plan) return;
    const source = plan;
    setCreating(true);
    setError("");
    setMessage("");
    setConflict("");
    try {
      const groupForNewPlan = PROTOCOL_TEMPLATE_TARGET_GROUPS.find((group) => group === source.target_group) ?? targetGroup;
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroup: groupForNewPlan }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel duplicar o plano.");
      await loadPlans(data.id);
      setPlan((current) => current && current.id === data.id
        ? {
            ...current,
            title: `${source.title} (cópia)`,
            meals: source.meals.map(sanitizeMealForPlanClone),
            weekly_slots: (source.weekly_slots ?? []).map((slot) => ({ ...slot })),
            substitutions: source.substitutions.map((item) => ({ ...item })),
            supplements: source.supplements.map((item) => ({ ...item })),
            target_energy_kcal: source.target_energy_kcal ?? null,
            target_protein_g: source.target_protein_g ?? null,
            target_carbohydrate_g: source.target_carbohydrate_g ?? null,
            target_fat_g: source.target_fat_g ?? null,
          }
        : current);
      setMessage("Plano duplicado a partir do selecionado. Revise e salve — nada foi persistido ainda.");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel duplicar o plano.");
    } finally {
      setCreating(false);
    }
  }

  /**
   * Carrega o PRÉ-PLANO gerado pelo assistente de IA no editor real — nunca
   * persiste sozinho e nunca ativa (mesmo princípio de duplicateCurrentPlan:
   * cria um plano novo pelo endpoint já existente, depois só sobrescreve
   * `meals` em memória; só vira gravação de verdade quando a nutricionista
   * clicar em "Salvar rascunho"/"Ativar no portal" como sempre).
   */
  async function applyAiDraft(group: ProtocolTemplateTargetGroup, meals: Meal[], substitutions: Substitution[] = []) {
    setCreating(true);
    setError("");
    setMessage("");
    setConflict("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroup: group }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível criar o plano.");
      await loadPlans(data.id);
      setPlan((current) => current && current.id === data.id ? { ...current, meals, substitutions: [...current.substitutions, ...substitutions] } : current);
      setMessage("Pré-plano da IA carregado no editor. Revise cada refeição, ajuste o que quiser e salve quando estiver pronto — nada foi ativado.");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o pré-plano.");
    } finally {
      setCreating(false);
    }
  }

  /**
   * R5 (seções 23-31) — "Usar plano anterior como base": clona o plano de
   * origem como um NOVO draft (mesmo princípio de `duplicateCurrentPlan`,
   * R4 — o plano de origem nunca é alterado) e substitui `meals` pelo
   * resultado já MESCLADO do changeset (KEEP/MODIFY/ADD calculado pelo
   * wizard) — nunca o draft inteiro do zero. Continua sem auto-save: só
   * "Salvar rascunho"/"Ativar" persiste de verdade.
   */
  async function applyAiChangeset(sourcePlanId: string, mergedMeals: Meal[]) {
    const source = plans.find((item) => item.id === sourcePlanId) ?? null;
    setCreating(true);
    setError("");
    setMessage("");
    setConflict("");
    try {
      const group = PROTOCOL_TEMPLATE_TARGET_GROUPS.find((item) => item === source?.target_group) ?? targetGroup;
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroup: group, title: source ? `${source.title} (Copilot)` : undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível aplicar a proposta.");
      await loadPlans(data.id);
      setPlan((current) => current && current.id === data.id ? { ...current, meals: mergedMeals } : current);
      setMessage("Proposta do Copilot aplicada com base no plano anterior. Revise e salve — nada foi ativado.");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível aplicar a proposta.");
    } finally {
      setCreating(false);
    }
  }

  // "✨ Ajustar quantidades" no plano SALVO (seção 4 do pedido de
  // fechamento de gaps) — reaproveita o Optimizer V2 via rota dedicada, que
  // já deriva os locks automaticamente do que está persistido em cada item.
  // Nunca persiste sozinho: só substitui plan.meals localmente, exigindo o
  // "Salvar rascunho"/"Ativar" normal, versionado, pra valer de verdade.
  async function optimizePlanQuantities() {
    if (!plan || !plan.target_energy_kcal) return;
    setOptimizingPlan(true);
    setOptimizeSummary("");
    setError("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/${plan.id}/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEnergyKcal: plan.target_energy_kcal ?? null,
          targetProteinG: plan.target_protein_g ?? null,
          targetCarbohydrateG: plan.target_carbohydrate_g ?? null,
          targetFatG: plan.target_fat_g ?? null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Não foi possível ajustar as quantidades.");
      setPlan((current) => current ? { ...current, meals: data.meals } : current);
      setOptimizeSummary(
        data.adjustments.length > 0
          ? `${data.adjustments.length} quantidade(s) ajustada(s). Itens bloqueados (🔒) não foram alterados. Revise e salve quando estiver pronto.`
          : "Nenhum ajuste foi necessário ou possível dentro dos limites técnicos."
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ajustar as quantidades.");
    } finally {
      setOptimizingPlan(false);
    }
  }

  async function save(nextStatus?: MealPlanStatus) {
    if (!plan) return;
    setSaving(true);
    setError("");
    setMessage("");
    setConflict("");
    try {
      const payload = {
        title: plan.title,
        status: nextStatus ?? plan.status,
        notes: plan.notes,
        target_energy_kcal: plan.target_energy_kcal ?? null,
        target_protein_g: plan.target_protein_g ?? null,
        target_carbohydrate_g: plan.target_carbohydrate_g ?? null,
        target_fat_g: plan.target_fat_g ?? null,
        meals: cleanMealsForSave(plan.meals),
        weekly_slots: cleanWeeklySlotsForSave(plan.weekly_slots ?? []),
        substitutions: plan.substitutions
          .filter((item) => item.base_food.trim() && item.option_food.trim())
          .map((item) => ({
            base_food: item.base_food,
            option_food: item.option_food,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            notes: item.notes ?? null,
            // Substituições nutricionais equivalentes por item (painel por
            // item) — sem estes campos, o editor perdia identidade
            // (source+refId), qualidade e aprovação ao salvar, quebrando a
            // ligação com o item prescrito e a filtragem de print/portal.
            base_food_source: item.base_food_source ?? null,
            base_food_ref_id: item.base_food_ref_id ?? null,
            option_food_source: item.option_food_source ?? null,
            option_food_ref_id: item.option_food_ref_id ?? null,
            option_household_measure_id: item.option_household_measure_id ?? null,
            option_nutrition_snapshot: item.option_nutrition_snapshot ?? null,
            equivalence_mode: item.equivalence_mode ?? null,
            equivalence_score: item.equivalence_score ?? null,
            equivalence_quality: item.equivalence_quality ?? null,
            approved_by_professional: item.approved_by_professional,
            ai_suggested: item.ai_suggested,
          })),
        supplements: plan.supplements
          .filter((item) => item.name.trim())
          .map((item) => ({
            name: item.name,
            dosage: item.dosage ?? null,
            unit: item.unit ?? null,
            instructions: item.instructions ?? null,
            notes: item.notes ?? null,
          })),
        // Optimistic concurrency: o backend ja suporta este campo (409 se
        // outra sessao salvou por cima); antes desta mudanca o cliente
        // nunca enviava expectedVersion, entao esse caminho nunca era
        // exercitado pela UI e uma sobrescrita silenciosa era possivel.
        expectedVersion: plan.version,
      };
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setConflict(data.message ?? "O plano alimentar foi atualizado em outra sessao. Recarregue antes de salvar.");
          return;
        }
        if (data.code === "MEAL_PLAN_PUBLICATION_BLOCKED") {
          setPublicationReview({
            valid: false,
            blockers: data.blockers ?? [],
            warnings: data.warnings ?? [],
            summary: data.summary ?? { meals: 0, items: 0, resolvedItems: 0, approvedExchanges: 0, staleExchanges: 0, blockers: data.blockers?.length ?? 0, warnings: data.warnings?.length ?? 0 },
            nutritionSummary: { energyKcal: null, proteinG: null, carbohydrateG: null, fatG: null, fiberG: null, unresolvedItems: 0 },
            mealSummary: [],
          });
          setReviewOpen(true);
          throw new Error(data.message ?? "Este plano ainda não pode ser publicado.");
        }
        throw new Error(data.message ?? "Nao foi possivel salvar o plano.");
      }
      await loadPlans(data.id);
      if (nextStatus === "active") {
        setReviewOpen(false);
        setPublicationReview(null);
      }
      setMessage(nextStatus === "active" ? "Plano ativado no portal do cliente." : "Plano alimentar salvo.");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel salvar o plano.");
    } finally {
      setSaving(false);
    }
  }

  async function reviewPublication() {
    if (!plan) return;
    setError("");
    setMessage("");
    setConflict("");
    setWarningsAccepted(false);
    if (hasUnsavedChanges) {
      setError("Salve o rascunho antes de revisar a publicação.");
      return;
    }
    setReviewing(true);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/${plan.id}/publication-review`, { cache: "no-store" });
      const data = await response.json() as PublicationReview & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel revisar o plano.");
      setPublicationReview(data);
      setReviewOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel revisar o plano.");
    } finally {
      setReviewing(false);
    }
  }

  const hasUnsavedChanges = Boolean(plan && savedPlanSignature && editablePlanSignature(plan) !== savedPlanSignature);
  const saveStateLabel = conflict
    ? "Conflito de versão"
    : saving
      ? "Salvando..."
      : hasUnsavedChanges
        ? "Alterações não salvas"
        : message
          ? "Salvo agora"
          : "Salvo";

  async function reloadAfterConflict() {
    setConflict("");
    await loadPlans(plan?.id);
  }

  async function confirmRemovePlan() {
    if (!deleteDraft) return;
    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/${deleteDraft.planId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Nao foi possivel excluir o plano.");
      setSelectedPlanId("");
      setPlan(null);
      setDeleteDraft(null);
      await loadPlans();
      setMessage("Plano alimentar excluido.");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel excluir o plano.");
    } finally {
      setDeleting(false);
    }
  }

  function openSavePlanAsTemplate() {
    if (!plan) return;
    const planTargetGroup = PROTOCOL_TEMPLATE_TARGET_GROUPS.find((group) => group === plan.target_group);
    setTemplateDraft({
      title: `${plan.title} - modelo`,
      targetGroup: planTargetGroup ?? targetGroup,
      error: "",
    });
  }

  async function savePlanAsTemplate() {
    if (!plan || !templateDraft) return;
    setTemplateSaving(true);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/${plan.id}/save-as-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: templateDraft.title.trim(), targetGroup: templateDraft.targetGroup }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Nao foi possivel salvar o modelo.");
      setTemplateDraft(null);
      setMessage("Novo modelo de dieta criado na biblioteca. O plano do paciente e o modelo original nao foram alterados.");
    } catch (cause) {
      setTemplateDraft({ ...templateDraft, error: cause instanceof Error ? cause.message : "Nao foi possivel salvar o modelo." });
    } finally {
      setTemplateSaving(false);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      {!plan && <section className="rounded-2xl border border-[#EAD8C2] bg-[#FAF7F2]/70 p-5">
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="brand-kicker mb-1">Plano alimentar individual</p>
            <h2 className="font-serif text-xl font-semibold text-[#3A3028] sm:text-2xl">Prescricao visual para o cliente</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#75675E]">
              Use um modelo como ponto de partida, ajuste alimentos, quantidades, suplementos e substituicoes, depois ative no portal.
            </p>
            {!aiEnabled && (
              <p className="mt-2 text-xs text-[#8C5F50]">
                Para usar Sugerir com IA, configure a chave em <a href="/dashboard/settings/ai" className="font-semibold underline">Inteligencia artificial</a>.
              </p>
            )}
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,220px)_auto] xl:shrink-0">
            <select value={targetGroup} onChange={(event) => setTargetGroup(event.target.value as ProtocolTemplateTargetGroup)} className="brand-input">
              {PROTOCOL_TEMPLATE_TARGET_GROUPS.map((group) => <option key={group} value={group}>{PROTOCOL_TEMPLATE_GROUP_LABELS[group]}</option>)}
            </select>
            <button type="button" onClick={() => void createFromTemplate()} disabled={creating} className="brand-btn-primary w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              {creating ? "Criando..." : "Criar por modelo"}
            </button>
            <button
              type="button"
              onClick={() => setAiWizardOpen(true)}
              disabled={creating}
              title={aiEnabled ? undefined : "Configure a chave de IA em Configurações para usar este recurso."}
              className="brand-btn-secondary w-full sm:w-auto"
            >
              <Sparkles className="h-4 w-4" />
              Criar com IA
            </button>
          </div>
        </div>
      </section>}

      {message && <p className="rounded-xl border border-[#D9E4D3] bg-[#F5FAF0] px-4 py-3 text-sm text-[#607A56]">{message}</p>}
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {conflict && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>{conflict}</p>
          <p className="mt-1 text-xs text-amber-700">Suas edicoes nesta tela ainda nao foram salvas. Recarregar traz a versao mais recente, descartando o que voce editou aqui.</p>
          <button
            type="button"
            onClick={() => void reloadAfterConflict()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            Recarregar plano
          </button>
        </div>
      )}

      {plans.length > 0 && (
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
          {plans.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectPlan(item.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                selectedPlanId === item.id ? "border-[#7F9A74] bg-[#EAF0E4] text-[#607A56]" : "border-[#EAD8C2] bg-[#FFFDFC] text-[#75675E] hover:bg-[#FBF7F1]"
              }`}
            >
              {item.status === "active" ? "Ativo" : "Rascunho"} - v{item.version}
            </button>
          ))}
        </div>
      )}

      {plan && (
        <div className="sticky top-2 z-30 rounded-xl border border-[#D9C4B2] bg-[#FFFDFC]/95 p-2.5 shadow-[0_12px_34px_rgba(58,48,40,0.12)] backdrop-blur-xl">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#3A3028]">{plan.title}</p>
              <p className={`mt-0.5 text-xs font-semibold ${hasUnsavedChanges ? "text-[#9A6B28]" : conflict ? "text-red-700" : "text-[#607A56]"}`}>
                {plan.status === "active" ? "Ativo" : "Rascunho"} - v{plan.version} · {saveStateLabel}
              </p>
              {/* R6.5.4 (seção 89) — só mostra quando não há edição local pendente (o timestamp do servidor ficaria enganoso nesse caso; "Alterações não salvas" já comunica isso). */}
              {!hasUnsavedChanges && plan.updated_at && formatPlanUpdatedAt(plan.updated_at) && (
                <p className="mt-0.5 text-[11px] text-[#9A978A]">Última alteração às {formatPlanUpdatedAt(plan.updated_at)}</p>
              )}
              {plan.status !== "active" && (
                <p className="mt-0.5 text-xs text-[#8C6E52]">Portal e impressão oficial continuam usando a versão ativa até este rascunho ser ativado.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
              <button type="button" onClick={() => void createFromTemplate()} disabled={creating || saving || deleting} className="brand-btn-secondary w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                Novo plano
              </button>
              <button
                type="button"
                onClick={() => setAiWizardOpen(true)}
                disabled={creating || saving || deleting}
                title={aiEnabled ? undefined : "Configure a chave de IA em Configurações para usar este recurso."}
                className="brand-btn-secondary w-full sm:w-auto"
              >
                <Sparkles className="h-4 w-4" />
                Criar com IA
              </button>
              <a
                href={`/dashboard/clients/${clientId}/print?secao=plano-alimentar${plan.status === "active" ? "" : `&planId=${encodeURIComponent(plan.id)}`}`}
                target="_blank"
                rel="noreferrer"
                className="brand-btn-secondary w-full sm:w-auto"
                title={plan.status === "active" ? "Imprime a versão ativa no portal." : "Abre uma prévia explícita deste rascunho; o portal continua usando o plano ativo."}
              >
                <Printer className="h-4 w-4" />
                {plan.status === "active" ? "Imprimir ativo" : "Prévia do rascunho"}
              </a>
              {plan.status === "active" && (
                <button type="button" onClick={() => void duplicateCurrentPlan()} disabled={saving || deleting || creating || plan.meals.length === 0} className="brand-btn-secondary w-full sm:w-auto">
                  <Copy className="h-4 w-4" />
                  Editar
                </button>
              )}
              <button type="button" onClick={() => void save()} disabled={saving || deleting || !hasUnsavedChanges || plan.status === "active"} className="brand-btn-secondary w-full sm:w-auto">
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button type="button" onClick={() => void reviewPublication()} disabled={saving || deleting || reviewing || plan.status === "active"} className="brand-btn-primary w-full sm:w-auto">
                <CheckCircle2 className="h-4 w-4" />
                {plan.status === "active" ? "Ativo" : reviewing ? "Revisando..." : "Revisar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {plan && (
        <section className="rounded-2xl border border-[#EAD8C2] bg-[#FFFDFC] p-3 sm:p-4">
          {/*
            R6.5.2 (regressão encontrada no fechamento): a coluna central já usa
            larguras mínimas fixas em px nos food rows (MealItemsEditor) que não
            cabem numa 3ª coluna à esquerda no breakpoint xl (1280px) — isso causava
            texto cortado/oculto e cliques interceptados pela sidebar sticky. Por
            isso a navegação de refeições só entra em 2xl (1536px+), onde há espaço
            real de sobra; em xl o layout permanece EXATAMENTE o de 2 colunas da R6.5.1.
          */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[220px_minmax(0,1fr)_360px]">
            {/* R6.5.2 (seções 4, 7-13) — navegação de refeições, coluna nova, só desktop largo (2xl+); deriva de plan.meals, sem estado próprio a sincronizar. */}
            <MealNavigationRail meals={plan.meals} />

            <div className="min-w-0 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="brand-label" htmlFor="meal-plan-title">Titulo do plano</label>
                  <input id="meal-plan-title" value={plan.title} onChange={(event) => setPlan({ ...plan, title: event.target.value })} disabled={plan.status === "active"} className="brand-input disabled:cursor-not-allowed disabled:bg-[#FAF7F2] disabled:text-[#75675E]" />
                </div>
                <div>
                  <label className="brand-label" htmlFor="meal-plan-status">Status</label>
                  <select id="meal-plan-status" value={plan.status} onChange={(event) => setPlan({ ...plan, status: event.target.value as MealPlanStatus })} disabled={plan.status === "active"} className="brand-input disabled:cursor-not-allowed disabled:bg-[#FAF7F2] disabled:text-[#75675E]">
                    <option value="draft">Rascunho</option>
                    <option value="active">Ativo no portal</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="brand-label" htmlFor="meal-plan-notes">Orientacoes gerais para o cliente</label>
                  <textarea id="meal-plan-notes" value={plan.notes ?? ""} onChange={(event) => setPlan({ ...plan, notes: event.target.value })} disabled={plan.status === "active"} className="brand-input min-h-16 resize-y disabled:cursor-not-allowed disabled:bg-[#FAF7F2] disabled:text-[#75675E]" />
                </div>
              </div>

              <div className="rounded-xl border border-[#EDE1D6] bg-[#FAF7F2]/60 p-3">
                <p className="brand-label mb-2">Meta nutricional do plano (opcional)</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <NutrientTargetInput id="target-energy-kcal" label="Energia (kcal)" value={plan.target_energy_kcal} disabled={plan.status === "active"} onChange={(value) => setPlan({ ...plan, target_energy_kcal: value })} />
                  <NutrientTargetInput id="target-protein-g" label="Proteína (g)" value={plan.target_protein_g} disabled={plan.status === "active"} onChange={(value) => setPlan({ ...plan, target_protein_g: value })} />
                  <NutrientTargetInput id="target-carbohydrate-g" label="Carboidrato (g)" value={plan.target_carbohydrate_g} disabled={plan.status === "active"} onChange={(value) => setPlan({ ...plan, target_carbohydrate_g: value })} />
                  <NutrientTargetInput id="target-fat-g" label="Gordura (g)" value={plan.target_fat_g} disabled={plan.status === "active"} onChange={(value) => setPlan({ ...plan, target_fat_g: value })} />
                </div>
                {plan.target_energy_kcal && plan.status !== "active" && (
                  <button
                    type="button"
                    onClick={() => void optimizePlanQuantities()}
                    disabled={optimizingPlan}
                    className="brand-btn-secondary mt-2"
                    title="Ajusta quantidades dos alimentos já vinculados para aproximar o plano da meta. Itens marcados com 🔒 nunca são alterados. Nada é salvo automaticamente."
                  >
                    <Sparkles className="h-4 w-4" />
                    {optimizingPlan ? "Ajustando..." : "✨ Ajustar quantidades"}
                  </button>
                )}
                {optimizeSummary && <p className="mt-1.5 text-xs text-[#607A56]">{optimizeSummary}</p>}
              </div>

              <MealItemsEditor
                meals={plan.meals}
                onChange={(meals) => setPlan({ ...plan, meals })}
                targetGroup={plan.target_group ?? targetGroup}
                aiEnabled={aiEnabled}
                context="meal"
                recipeTags={[plan.target_group, "plano personalizado"].filter(Boolean).join(", ")}
                recipeDescriptionPrefix={`Receita criada a partir do plano "${plan.title}"`}
                onMessage={setMessage}
                onError={setError}
                showMacroFooter={false}
                clientId={clientId}
                mealPlanId={plan.id}
                substitutions={plan.substitutions}
                onSubstitutionsChange={(substitutions) => setPlan({ ...plan, substitutions })}
                readOnly={plan.status === "active"}
              />
            </div>

            <aside className="order-first xl:order-none xl:sticky xl:top-24 xl:self-start">
              <MealPlanNutritionWorkspacePanel
                meals={plan.meals}
                target={{
                  energyKcal: plan.target_energy_kcal ?? null,
                  proteinG: plan.target_protein_g ?? null,
                  carbohydrateG: plan.target_carbohydrate_g ?? null,
                  fatG: plan.target_fat_g ?? null,
                }}
              />
            </aside>
          </div>

          <details className="mt-4 rounded-xl border border-[#EDE1D6] bg-[#FAF7F2]/50 p-3">
            <summary className="cursor-pointer font-serif text-lg font-semibold text-[#3A3028]">Semana e extras</summary>
            <div className="mt-4 space-y-5">
              <WeeklyMealGridEditor
                slots={plan.weekly_slots ?? []}
                onChange={(weekly_slots) => setPlan({ ...plan, weekly_slots })}
              />

              <EditableList
                title="Suplementos"
                items={plan.supplements}
                onChange={(supplements) => setPlan({ ...plan, supplements })}
                emptyItem={{ name: "", dosage: "", unit: "", instructions: "", notes: "" }}
                fields={["name", "dosage", "unit", "instructions"]}
                labels={["Nome", "Dose", "Un.", "Como usar"]}
              />

              <SubstitutionsEditor
                items={plan.substitutions}
                onChange={(substitutions) => setPlan({ ...plan, substitutions })}
              />
            </div>
          </details>

          <div id="meal-plan-actions" className="flex flex-col gap-3 border-t border-[#EDE1D6] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setDeleteDraft({ planId: plan.id, title: plan.title, status: plan.status })}
              disabled={deleting || saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "Excluindo..." : "Excluir plano"}
            </button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={`/dashboard/clients/${clientId}/print?secao=plano-alimentar${plan.status === "active" ? "" : `&planId=${encodeURIComponent(plan.id)}`}`}
                target="_blank"
                rel="noreferrer"
                className="brand-btn-secondary w-full sm:w-auto"
                title={plan.status === "active" ? "Imprime a versão ativa no portal." : "Abre uma prévia explícita deste rascunho; o portal continua usando o plano ativo."}
              >
                <Printer className="h-4 w-4" />
                {plan.status === "active" ? "Imprimir ativo" : "Prévia do rascunho"}
              </a>
              <button type="button" onClick={() => void duplicateCurrentPlan()} disabled={saving || deleting || creating || plan.meals.length === 0} className="brand-btn-secondary w-full sm:w-auto">
                <Copy className="h-4 w-4" />
                {plan.status === "active" ? "Editar como rascunho" : "Duplicar este plano"}
              </button>
              <button type="button" onClick={openSavePlanAsTemplate} disabled={saving || deleting || plan.meals.length === 0} className="brand-btn-secondary w-full sm:w-auto">
                <Save className="h-4 w-4" />
                Salvar como modelo
              </button>
              <button type="button" onClick={() => void save()} disabled={saving || deleting || plan.status === "active"} className="brand-btn-secondary w-full sm:w-auto">
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar rascunho"}
              </button>
              <button type="button" onClick={() => void reviewPublication()} disabled={saving || deleting || reviewing || plan.status === "active"} className="brand-btn-primary w-full sm:w-auto">
                <CheckCircle2 className="h-4 w-4" />
                {plan.status === "active" ? "Plano ativo" : reviewing ? "Revisando..." : "Revisar e publicar"}
              </button>
            </div>
          </div>
        </section>
      )}

      {aiWizardOpen && (
        <AiMealPlanWizard
          clientId={clientId}
          defaultTargetGroup={plan?.target_group && PROTOCOL_TEMPLATE_TARGET_GROUPS.includes(plan.target_group as ProtocolTemplateTargetGroup) ? plan.target_group as ProtocolTemplateTargetGroup : targetGroup}
          onClose={() => setAiWizardOpen(false)}
          onApply={applyAiDraft}
          onApplyChangeset={applyAiChangeset}
          previousPlans={plans}
        />
      )}

      {portalReady && templateDraft && plan && createPortal(
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
          <section className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
            <div className="shrink-0 border-b border-[#EDE1D6] px-5 py-4">
              <p className="brand-kicker">Promover para biblioteca</p>
              <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">Salvar plano como modelo</h2>
              <p className="mt-1 text-xs leading-5 text-[#75675E]">Isto cria um modelo novo de dieta. Nao altera o plano do paciente nem o modelo original usado como ponto de partida.</p>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              <div>
                <label className="brand-label">Titulo do novo modelo</label>
                <input value={templateDraft.title} onChange={(event) => setTemplateDraft({ ...templateDraft, title: event.target.value })} className="brand-input" />
              </div>
              <div>
                <label className="brand-label">Grupo alvo</label>
                <select value={templateDraft.targetGroup} onChange={(event) => setTemplateDraft({ ...templateDraft, targetGroup: event.target.value as ProtocolTemplateTargetGroup })} className="brand-input">
                  {PROTOCOL_TEMPLATE_TARGET_GROUPS.map((group) => <option key={group} value={group}>{PROTOCOL_TEMPLATE_GROUP_LABELS[group]}</option>)}
                </select>
              </div>
              <div className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] p-3 text-sm text-[#75675E]">
                <p><strong className="text-[#3A3028]">{plan.meals.length}</strong> refeicao(oes), <strong className="text-[#3A3028]">{plan.substitutions.length}</strong> substituicao(oes) e <strong className="text-[#3A3028]">{plan.supplements.length}</strong> suplemento(s) serao copiados.</p>
              </div>
              {templateDraft.error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{templateDraft.error}</p>}
            </div>
            <div className="grid shrink-0 gap-3 border-t border-[#EDE1D6] px-5 py-3 sm:flex sm:justify-end">
              <button type="button" onClick={() => setTemplateDraft(null)} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
              <button type="button" onClick={() => void savePlanAsTemplate()} disabled={templateSaving || !templateDraft.title.trim()} className="brand-btn-primary w-full sm:w-auto">
                <Save className="h-4 w-4" />
                {templateSaving ? "Salvando..." : "Criar modelo novo"}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
      {portalReady && deleteDraft && createPortal(
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
          <section className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_28px_90px_rgba(58,48,40,0.24)]">
            <div className="shrink-0 border-b border-[#EDE1D6] px-5 py-4">
              <p className="brand-kicker text-red-700">Excluir plano alimentar</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#3A3028]">Confirmar exclusao</h2>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
              <p className="text-sm leading-6 text-[#75675E]">
                Deseja excluir o plano <strong className="text-[#3A3028]">{deleteDraft.title}</strong>? Esta acao nao pode ser desfeita.
              </p>
              {deleteDraft.status === "active" && (
                <p className="rounded-xl border border-[#E8C3BA] bg-[#FFF7F5] p-3 text-xs leading-5 text-[#9A5C4E]">
                  Este plano esta ativo no portal do cliente. Ao excluir, ele deixara de aparecer para a paciente.
                </p>
              )}
            </div>
            <div className="grid shrink-0 gap-3 border-t border-[#EDE1D6] px-5 py-3 sm:flex sm:justify-end">
              <button type="button" onClick={() => setDeleteDraft(null)} disabled={deleting} className="brand-btn-secondary w-full sm:w-auto">Cancelar</button>
              <button
                type="button"
                onClick={() => void confirmRemovePlan()}
                disabled={deleting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-red-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Excluindo..." : "Excluir plano"}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
      {portalReady && reviewOpen && publicationReview && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3A3028]/45 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="publication-review-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#607A56]">Publicação</p>
                <h3 id="publication-review-title" className="font-serif text-2xl font-semibold text-[#3A3028]">
                  Revisão do plano
                </h3>
                <p className={`mt-1 text-sm font-semibold ${publicationReview.valid ? "text-[#607A56]" : "text-red-700"}`}>
                  {publicationReview.valid ? "Plano pronto para publicação." : "Este plano ainda não pode ser publicado."}
                </p>
              </div>
              <button type="button" onClick={() => setReviewOpen(false)} className="rounded-full p-2 text-[#75675E] hover:bg-[#F7F0E8]" aria-label="Fechar revisão">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-[#EAD8C2] bg-[#FAF7F2] p-3"><p className="text-xs text-[#8C6E52]">Refeições</p><strong>{publicationReview.summary.meals}</strong></div>
              <div className="rounded-xl border border-[#EAD8C2] bg-[#FAF7F2] p-3"><p className="text-xs text-[#8C6E52]">Alimentos</p><strong>{publicationReview.summary.resolvedItems}/{publicationReview.summary.items}</strong></div>
              <div className="rounded-xl border border-[#EAD8C2] bg-[#FAF7F2] p-3"><p className="text-xs text-[#8C6E52]">Trocas aprovadas</p><strong>{publicationReview.summary.approvedExchanges}</strong></div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              {[
                ["Energia", publicationReview.nutritionSummary.energyKcal === null ? "-" : `${Math.round(publicationReview.nutritionSummary.energyKcal)} kcal`],
                ["Proteína", publicationReview.nutritionSummary.proteinG === null ? "-" : `${publicationReview.nutritionSummary.proteinG.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g`],
                ["Carboidrato", publicationReview.nutritionSummary.carbohydrateG === null ? "-" : `${publicationReview.nutritionSummary.carbohydrateG.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g`],
                ["Gordura", publicationReview.nutritionSummary.fatG === null ? "-" : `${publicationReview.nutritionSummary.fatG.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g`],
                ["Fibra", publicationReview.nutritionSummary.fiberG === null ? "-" : `${publicationReview.nutritionSummary.fiberG.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} g`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[#EDE1D6] p-2 text-center">
                  <p className="text-[10px] uppercase tracking-[0.08em] text-[#9A8B80]">{label}</p>
                  <p className="font-semibold text-[#3A3028]">{value}</p>
                </div>
              ))}
            </div>

            {publicationReview.blockers.length > 0 && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Problemas que impedem publicação
                </div>
                <ul className="space-y-2 text-sm text-red-800">
                  {publicationReview.blockers.map((item, index) => (
                    <li key={`${item.code}-${index}`}>{item.mealName ? `${item.mealName}: ` : ""}{item.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {publicationReview.warnings.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  Avisos para revisão
                </div>
                <ul className="space-y-2 text-sm text-amber-900">
                  {publicationReview.warnings.map((item, index) => (
                    <li key={`${item.code}-${index}`}>{item.message}</li>
                  ))}
                </ul>
                <label className="mt-3 flex items-center gap-2 text-sm text-amber-900">
                  <input type="checkbox" checked={warningsAccepted} onChange={(event) => setWarningsAccepted(event.target.checked)} />
                  Revisei os avisos.
                </label>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-[#EAD8C2] p-4">
              <p className="mb-2 font-serif text-lg font-semibold">Resumo por refeição</p>
              <div className="space-y-1 text-sm text-[#75675E]">
                {publicationReview.mealSummary.map((meal) => (
                  <p key={meal.mealName}>{meal.mealName}: {meal.blockers > 0 ? `${meal.blockers} problema(s)` : meal.warnings > 0 ? `${meal.warnings} aviso(s)` : "OK"}</p>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setReviewOpen(false)} className="brand-btn-secondary">Voltar e editar</button>
              <button
                type="button"
                onClick={() => void save("active")}
                disabled={!publicationReview.valid || saving || (publicationReview.warnings.length > 0 && !warningsAccepted)}
                className="brand-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saving ? "Publicando..." : "Publicar plano"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function NutrientTargetInput({ id, label, value, disabled = false, onChange }: { id: string; label: string; value: number | null | undefined; disabled?: boolean; onChange: (value: number | null) => void }) {
  return (
    <div>
      <label className="brand-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={0}
        inputMode="decimal"
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value;
          onChange(raw === "" ? null : Number(raw));
        }}
        className="brand-input disabled:cursor-not-allowed disabled:bg-[#FAF7F2] disabled:text-[#75675E]"
        placeholder="—"
      />
    </div>
  );
}

const WEEK_DAYS = [
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
  "Domingo",
] as const;

const WEEKLY_MEAL_TYPES = [
  { id: "almoco", label: "Almoco" },
  { id: "jantar", label: "Jantar" },
] as const;

function cleanWeeklySlotsForSave(slots: WeeklySlot[]): WeeklySlot[] {
  return slots
    .filter((slot) => slot.weekday >= 0 && slot.weekday <= 6)
    .filter((slot) => slot.meal_type === "almoco" || slot.meal_type === "jantar")
    .map((slot) => ({
      weekday: slot.weekday,
      meal_type: slot.meal_type,
      title: slot.title?.trim() || null,
      notes: slot.notes?.trim() || null,
      source_meal_id: slot.source_meal_id ?? null,
    }))
    .filter((slot) => slot.title || slot.notes || slot.source_meal_id);
}

function WeeklyMealGridEditor({
  slots,
  onChange,
}: {
  slots: WeeklySlot[];
  onChange: (slots: WeeklySlot[]) => void;
}) {
  const slotFor = (weekday: number, mealType: WeeklySlot["meal_type"]) =>
    slots.find((slot) => slot.weekday === weekday && slot.meal_type === mealType);

  const updateSlot = (weekday: number, mealType: WeeklySlot["meal_type"], patch: Partial<WeeklySlot>) => {
    const current = slotFor(weekday, mealType);
    if (current) {
      onChange(slots.map((slot) => slot.weekday === weekday && slot.meal_type === mealType ? { ...slot, ...patch } : slot));
      return;
    }
    onChange([...slots, { weekday, meal_type: mealType, title: "", notes: "", ...patch }]);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-[#EDE1D6] bg-[#FAF7F2]/60 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="brand-kicker mb-1">Grade semanal</p>
          <h3 className="flex items-center gap-2 font-serif text-xl font-semibold text-[#3A3028]">
            <CalendarDays className="h-5 w-5 text-[#607A56]" />
            Almoco e jantar da semana
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[#75675E]">
            Guia simples para preencher junto com a paciente. Ele complementa o plano alimentar ativo e aparece no portal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([])}
          className="rounded-full border border-[#EAD8C2] px-3 py-2 text-xs font-semibold text-[#8C6E52] transition hover:bg-[#FFFDFC]"
        >
          Limpar grade
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-7">
        {WEEK_DAYS.map((day, weekday) => (
          <div key={day} className="rounded-xl border border-[#EAD8C2] bg-[#FFFDFC] p-3">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#607A56]">{day}</p>
            <div className="space-y-3">
              {WEEKLY_MEAL_TYPES.map((mealType) => {
                const slot = slotFor(weekday, mealType.id);
                return (
                  <div key={mealType.id} className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8C5F50]">{mealType.label}</label>
                    <input
                      value={slot?.title ?? ""}
                      onChange={(event) => updateSlot(weekday, mealType.id, { title: event.target.value })}
                      className="brand-input h-10 rounded-xl px-3 text-xs"
                      placeholder="Ex: arroz, feijao..."
                    />
                    <textarea
                      value={slot?.notes ?? ""}
                      onChange={(event) => updateSlot(weekday, mealType.id, { notes: event.target.value })}
                      className="brand-input min-h-16 resize-y rounded-xl px-3 py-2 text-xs"
                      placeholder="Observacao"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EditableList<T extends Record<string, string | null | undefined>>({
  title,
  items,
  onChange,
  emptyItem,
  fields,
  labels,
}: {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  emptyItem: T;
  fields: Array<keyof T>;
  labels: string[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-serif text-xl font-semibold text-[#3A3028]">{title}</h3>
        <button type="button" onClick={() => onChange([...items, emptyItem])} className="brand-btn-secondary w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#D9C4B2] px-4 py-5 text-center text-sm text-[#9A8B80]">Nenhum item cadastrado.</p>
      ) : items.map((item, itemIndex) => (
        <div key={itemIndex} className="grid min-w-0 gap-2 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          {fields.map((field, fieldIndex) => (
            <input
              key={String(field)}
              value={item[field] ?? ""}
              onChange={(event) => onChange(items.map((row, index) => index === itemIndex ? { ...row, [field]: event.target.value } : row))}
              className="brand-input"
              placeholder={labels[fieldIndex]}
            />
          ))}
          <button type="button" onClick={() => onChange(items.filter((_, index) => index !== itemIndex))} className="inline-flex h-11 items-center justify-center rounded-xl px-3 text-red-600 hover:bg-red-50" aria-label={`Remover ${title.toLowerCase()}`} title="Remover">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Lista de substituicoes com autocomplete de alimento nos campos base/opcao
 * (reaproveita a mesma busca do editor de refeicoes via useDebouncedFoodSearch).
 * Continua sendo uma lista plana sem vinculo com food_ref_id — so poupa
 * digitacao repetida do nome do alimento (sem mudanca de schema/contrato).
 */
function SubstitutionsEditor({ items, onChange }: { items: Substitution[]; onChange: (items: Substitution[]) => void }) {
  const [activeField, setActiveField] = useState("");
  const [query, setQuery] = useState("");
  const { results, loading } = useDebouncedFoodSearch(activeField ? query : "");

  function updateItem(index: number, patch: Partial<Substitution>) {
    onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-serif text-xl font-semibold text-[#3A3028]">Substituicoes</h3>
        <button
          type="button"
          onClick={() => onChange([...items, { base_food: "", option_food: "", quantity: "", unit: "", notes: "" }])}
          className="brand-btn-secondary w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#D9C4B2] px-4 py-5 text-center text-sm text-[#9A8B80]">Nenhum item cadastrado.</p>
      ) : items.map((item, index) => (
        <div key={index} className="grid min-w-0 gap-2 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <FoodAutocompleteField
            value={item.base_food}
            placeholder="Alimento base"
            active={activeField === `${index}:base`}
            results={results}
            loading={loading}
            onFocus={() => { setActiveField(`${index}:base`); setQuery(item.base_food); }}
            onBlur={() => window.setTimeout(() => setActiveField(""), 140)}
            onChange={(value) => { updateItem(index, { base_food: value }); setQuery(value); }}
            onSelect={(name) => { updateItem(index, { base_food: name }); setActiveField(""); }}
          />
          <FoodAutocompleteField
            value={item.option_food}
            placeholder="Pode trocar por"
            active={activeField === `${index}:option`}
            results={results}
            loading={loading}
            onFocus={() => { setActiveField(`${index}:option`); setQuery(item.option_food); }}
            onBlur={() => window.setTimeout(() => setActiveField(""), 140)}
            onChange={(value) => { updateItem(index, { option_food: value }); setQuery(value); }}
            onSelect={(name) => { updateItem(index, { option_food: name }); setActiveField(""); }}
          />
          <input value={item.quantity ?? ""} onChange={(event) => updateItem(index, { quantity: event.target.value })} className="brand-input" placeholder="Quantidade da troca" aria-label="Quantidade da substituicao" />
          <input value={item.unit ?? ""} onChange={(event) => updateItem(index, { unit: event.target.value })} className="brand-input" placeholder="Unidade da troca" aria-label="Unidade da substituicao" />
          <button type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} className="inline-flex h-11 items-center justify-center rounded-xl px-3 text-red-600 hover:bg-red-50" aria-label="Remover substituicao" title="Remover">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function FoodAutocompleteField({
  value,
  placeholder,
  active,
  results,
  loading,
  onFocus,
  onBlur,
  onChange,
  onSelect,
}: {
  value: string;
  placeholder: string;
  active: boolean;
  results: FoodSuggestion[];
  loading: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (value: string) => void;
  onSelect: (name: string) => void;
}) {
  const showDropdown = active && value.trim().length >= 2 && (loading || results.length > 0);
  return (
    <div className="relative min-w-0">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className="brand-input"
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {showDropdown && (
        <div aria-label="Sugestoes de alimentos" className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-56 overflow-y-auto rounded-xl border border-[#EAD8C2] bg-white p-1 shadow-[0_18px_44px_rgba(58,48,40,0.16)]">
          {loading ? (
            <p className="px-3 py-2 text-sm text-[#8C6E52]">Buscando...</p>
          ) : results.map((suggestion) => (
            <button
              key={suggestion.numero}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(suggestion.descricao)}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#3A3028] transition-colors hover:bg-[#FAF7F2]"
            >
              {suggestion.descricao}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
