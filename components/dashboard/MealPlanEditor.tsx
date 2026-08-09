"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, CheckCircle2, Plus, Save, Trash2 } from "lucide-react";
import { MealItemsEditor, cleanMealsForSave, type Meal } from "@/components/dashboard/MealItemsEditor";
import {
  PROTOCOL_TEMPLATE_GROUP_LABELS,
  PROTOCOL_TEMPLATE_TARGET_GROUPS,
  type ProtocolTemplateTargetGroup,
} from "@/lib/protocol-templates/constants";

type MealPlanStatus = "draft" | "active" | "archived";
type Substitution = { base_food: string; option_food: string; quantity?: string | null; unit?: string | null; notes?: string | null };
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
type MealPlan = {
  id: string;
  title: string;
  target_group: string | null;
  status: MealPlanStatus;
  version: number;
  notes: string | null;
  meals: Meal[];
  weekly_slots: WeeklySlot[];
  substitutions: Substitution[];
  supplements: Supplement[];
};

export function MealPlanEditor({ clientId, onSaved }: { clientId: string; onSaved?: () => void }) {
  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [targetGroup, setTargetGroup] = useState<ProtocolTemplateTargetGroup>("ADULTO_SAUDAVEL");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  const loadPlans = useCallback(async (preferredPlanId?: string) => {
    const response = await fetch(`/api/admin/clients/${clientId}/meal-plans`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as MealPlan[];
    setPlans(data);
    const current = data.find((item) => item.id === preferredPlanId) ?? data[0] ?? null;
    setSelectedPlanId(current?.id ?? "");
    setPlan(current);
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
    if (!templateDraft) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [templateDraft]);

  function selectPlan(id: string) {
    setSelectedPlanId(id);
    setPlan(plans.find((item) => item.id === id) ?? null);
  }

  async function createFromTemplate() {
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroup }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel criar o plano.");
      await loadPlans(data.id);
      setMessage("Plano criado a partir do modelo. Revise, personalize e ative quando estiver pronto.");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel criar o plano.");
    } finally {
      setCreating(false);
    }
  }

  async function save(nextStatus?: MealPlanStatus) {
    if (!plan) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        title: plan.title,
        status: nextStatus ?? plan.status,
        notes: plan.notes,
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
      };
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Nao foi possivel salvar o plano.");
      await loadPlans(data.id);
      setMessage(nextStatus === "active" ? "Plano ativado no portal do cliente." : "Plano alimentar salvo.");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Nao foi possivel salvar o plano.");
    } finally {
      setSaving(false);
    }
  }

  async function removePlan() {
    if (!plan) return;
    const warning = plan.status === "active"
      ? `O plano "${plan.title}" esta ativo no portal. Deseja realmente exclui-lo?`
      : `Deseja excluir o plano "${plan.title}"? Esta acao nao pode ser desfeita.`;
    if (!window.confirm(warning)) return;

    setDeleting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/meal-plans/${plan.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? "Nao foi possivel excluir o plano.");
      setSelectedPlanId("");
      setPlan(null);
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
      <section className="rounded-2xl border border-[#EAD8C2] bg-[#FAF7F2]/70 p-5">
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
          </div>
        </div>
      </section>

      {message && <p className="rounded-xl border border-[#D9E4D3] bg-[#F5FAF0] px-4 py-3 text-sm text-[#607A56]">{message}</p>}
      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

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
        <section className="space-y-5 rounded-2xl border border-[#EAD8C2] bg-[#FFFDFC] p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="brand-label">Titulo do plano</label>
              <input value={plan.title} onChange={(event) => setPlan({ ...plan, title: event.target.value })} className="brand-input" />
            </div>
            <div>
              <label className="brand-label">Status</label>
              <select value={plan.status} onChange={(event) => setPlan({ ...plan, status: event.target.value as MealPlanStatus })} className="brand-input">
                <option value="draft">Rascunho</option>
                <option value="active">Ativo no portal</option>
                <option value="archived">Arquivado</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="brand-label">Orientacoes gerais para o cliente</label>
              <textarea value={plan.notes ?? ""} onChange={(event) => setPlan({ ...plan, notes: event.target.value })} className="brand-input min-h-24 resize-y" />
            </div>
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
          />

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

          <EditableList
            title="Substituicoes"
            items={plan.substitutions}
            onChange={(substitutions) => setPlan({ ...plan, substitutions })}
            emptyItem={{ base_food: "", option_food: "", quantity: "", unit: "", notes: "" }}
            fields={["base_food", "option_food", "quantity", "unit"]}
            labels={["Alimento base", "Pode trocar por", "Qtd.", "Un."]}
          />

          <div className="flex flex-col gap-3 border-t border-[#EDE1D6] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => void removePlan()} disabled={deleting || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50">
              <Trash2 className="h-4 w-4" />
              {deleting ? "Excluindo..." : "Excluir plano"}
            </button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={openSavePlanAsTemplate} disabled={saving || deleting || plan.meals.length === 0} className="brand-btn-secondary w-full sm:w-auto">
                <Save className="h-4 w-4" />
                Salvar como modelo
              </button>
              <button type="button" onClick={() => void save()} disabled={saving || deleting} className="brand-btn-secondary w-full sm:w-auto">
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar rascunho"}
              </button>
              <button type="button" onClick={() => void save("active")} disabled={saving || deleting || plan.status === "active"} className="brand-btn-primary w-full sm:w-auto">
                <CheckCircle2 className="h-4 w-4" />
                {plan.status === "active" ? "Plano ativo" : "Ativar no portal"}
              </button>
            </div>
          </div>
        </section>
      )}

      {portalReady && templateDraft && plan && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/30 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6">
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
