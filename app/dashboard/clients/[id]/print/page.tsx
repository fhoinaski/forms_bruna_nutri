import { notFound } from "next/navigation";
import Image from "next/image";
import { getSessionFromCookies } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getClientProtocols } from "@/lib/repositories/client-protocols";
import { getClientTasks } from "@/lib/repositories/client-tasks";
import { getClientEvolutions } from "@/lib/repositories/client-evolutions";
import { getClientTimeline } from "@/lib/repositories/client-timeline";
import { getSubmissionById } from "@/lib/repositories/submissions";
import { getExistingNutritionRecord } from "@/lib/repositories/nutrition-records";
import { getActiveMealPlan, type MealPlanMealPayload } from "@/lib/repositories/meal-plans";
import { calculatePlanNutrients, roundedNutrients, type NutrientValues } from "@/lib/nutrition/nutrients";
import { compareTargetVsPrescribed, type NutrientTarget } from "@/lib/nutrition/targets";
import { resolveMealPlanChangeReferences, buildFoodReferenceLookup } from "@/lib/ai/agents/nutrition/meal-plan-change-agent";
import { getRecipeById } from "@/lib/repositories/recipes";
import { formatHeightDisplay } from "@/lib/clinical/anthropometry";
import { PrintButton } from "./PrintButton";

const NUTRIENT_LABELS_PT: Record<string, string> = {
  energyKcal: "Energia",
  proteinG: "Proteína",
  carbohydrateG: "Carboidrato",
  fatG: "Gordura",
  fiberG: "Fibra",
};

/** kcal em pt-BR sem casas decimais (ex.: "1.560") — nunca "1559.8". */
function fmtKcal(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : Math.round(value).toLocaleString("pt-BR");
}

/** Macros (g) em pt-BR com 1 casa decimal (ex.: "120,3") — nunca "120.3". */
function fmtMacro(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Quantidade de um item ("37.5" -> "37,5 g") — so formata locale, nunca recalcula o numero. */
function fmtQuantity(quantity: string | null | undefined, unit: string | null | undefined): string {
  const raw = (quantity ?? "").trim();
  if (!raw) return unit?.trim() || "Porção individual";
  const numeric = Number(raw.replace(",", "."));
  const display = Number.isFinite(numeric) ? numeric.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : raw;
  return [display, unit].filter(Boolean).join(" ");
}

/**
 * Algumas notas de refeição são texto OPERACIONAL do profissional/IA
 * (ex.: "Sugerido por IA com base na TACO. Revisar antes de salvar." —
 * lib/ai/agents/nutrition/meal-suggestion-agent.ts; "Receita da biblioteca
 * - 1 porção..." — components/dashboard/MealItemsEditor.tsx), nunca
 * destinado ao paciente. Filtra so na APRESENTAÇÃO do cardápio (nunca
 * apaga o dado — o editor continua mostrando a nota completa).
 */
const INTERNAL_NOTE_PREFIXES = [
  "Sugerido por IA",
  "Receita da biblioteca -",
  "Modelo sugerido por IA",
  "Plano criado a partir de modelo predefinido",
];
function isPatientFacingNote(notes: string | null | undefined): notes is string {
  if (!notes || !notes.trim()) return false;
  return !INTERNAL_NOTE_PREFIXES.some((prefix) => notes.startsWith(prefix));
}

export const dynamic = "force-dynamic";

function formatDate(value: string | null, fmt = "dd/MM/yyyy"): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit",
      year: "numeric",
      ...(fmt.includes("HH") ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  } catch { return "—"; }
}

const TIMELINE_LABELS: Record<string, string> = {
  client_created: "Cliente cadastrado",
  protocol_applied: "Protocolo aplicado",
  protocol_created: "Protocolo criado",
  task_completed: "Tarefa concluída",
  evolution_recorded: "Evolução registrada",
  report_generated: "Relatório gerado",
  protocol_completed: "Protocolo concluído",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const SUBMISSION_ANSWER_LABELS: Record<string, string> = {
  tipoAtendimento: "Tipo de atendimento",
  idade: "Idade",
  nascimento: "Data de nascimento",
  profissao: "Profissão",
  cidade: "Cidade",
  motivacao: "Motivação para buscar acompanhamento",
  objetivo: "Objetivo principal",
  incomodo: "O que mais incomoda hoje",
  diagnostico: "Diagnóstico",
  medicacao: "Medicação em uso",
  anticoncepcional: "Uso de anticoncepcional",
  gestante: "Gestante ou amamentando",
  sintomas: "Sintomas frequentes",
  suplementos: "Suplementos em uso",
  suplementosNegativo: "Suplementos que não se adaptaram",
  rotina: "Rotina diária",
  semComer: "Fica muito tempo sem comer",
  comerEmocao: "Come por fome ou emoção",
  fomeDia: "Fome ao longo do dia",
  sonoHoras: "Horas de sono",
  descansada: "Acorda descansada",
  estresse: "Nível de estresse",
  atividadeFisica: "Atividade física",
  intestinoFreq: "Frequência intestinal",
  desconforto: "Desconforto intestinal",
  naoGosta: "Alimentos que não gosta",
  favoritos: "Alimentos favoritos",
  diaAlimentar: "Dia alimentar típico",
  expectativas: "Expectativas do acompanhamento",
  disposicao: "Disposição para mudar (0-10)",
  espacoLivre: "Espaço livre / outras observações",
  child_name: "Nome da criança",
  child_age: "Idade da criança",
  child_weight_kg: "Peso da criança (kg)",
  child_height_cm: "Altura da criança (cm)",
  child_birth_date: "Data de nascimento da criança",
  child_breastfeeding: "Amamentação",
  child_food_repertoire: "Repertório alimentar da criança",
  child_feeding_difficulties: "Dificuldades alimentares da criança",
  child_school_routine: "Rotina escolar",
};

const SUBMISSION_LONG_TEXT_KEYS = new Set([
  "motivacao",
  "incomodo",
  "rotina",
  "fomeDia",
  "atividadeFisica",
  "naoGosta",
  "favoritos",
  "diaAlimentar",
  "expectativas",
  "espacoLivre",
  "child_food_repertoire",
  "child_feeding_difficulties",
  "child_school_routine",
  "child_breastfeeding",
]);

function hasNutritionRecordContent(record: Awaited<ReturnType<typeof getExistingNutritionRecord>>): boolean {
  if (!record) return false;
  return [
    record.chief_complaint,
    record.life_stage,
    record.biological_sex,
    record.gestational_weeks,
    record.breastfeeding_context,
    record.clinical_history,
    record.diagnoses,
    record.medications,
    record.supplements,
    record.allergies,
    record.restrictions,
    record.food_preferences,
    record.food_aversions,
    record.eating_routine,
    record.intestinal_health,
    record.sleep_routine,
    record.stress_context,
    record.physical_activity,
    record.hydration,
    record.current_weight_kg,
    record.height_cm,
    record.bmi,
    record.waist_cm,
    record.anthropometry_notes,
    record.pediatric_growth_notes,
    record.target_weight_kg,
    record.target_notes,
    record.exams,
    record.assessment,
    record.goals,
    record.care_plan,
    record.risk_flags,
    record.family_context,
    record.private_notes,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
}

export default async function ClientPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ secao?: string }>;
}) {
  const admin = await getSessionFromCookies();
  if (!admin) notFound();

  const { id } = await params;
  const { secao } = await searchParams;
  const onlyMealPlan = secao === "plano-alimentar";

  const [client, protocols, tasks, evolutions, timeline, nutritionRecord, activeMealPlan] = await Promise.all([
    getClientById(id),
    getClientProtocols(id),
    getClientTasks(id),
    getClientEvolutions(id),
    getClientTimeline(id),
    getExistingNutritionRecord(id),
    getActiveMealPlan(id),
  ]);

  if (!client) notFound();

  const submission = client.source_submission_id
    ? await getSubmissionById(client.source_submission_id)
    : null;

  const activeEvolutions = evolutions.filter((e) => e.weight || e.progress_notes);
  const lastEvolution = activeEvolutions[0];

  // Mesmo motor nutricional usado pelo editor (lib/nutrition/nutrients.ts) —
  // a impressão nunca recalcula com uma fórmula própria (P0: causa raiz do
  // divergir de calorias entre tela e PDF era exatamente isso).
  const { references, measuresById } = activeMealPlan
    ? await resolveMealPlanChangeReferences(activeMealPlan)
    : { references: [], measuresById: new Map() };
  const foodLookup = buildFoodReferenceLookup(references, measuresById);
  const nutrition = activeMealPlan ? calculatePlanNutrients(activeMealPlan, foodLookup) : null;
  const planTotals: NutrientValues | null = nutrition ? roundedNutrients(nutrition.total.values) : null;
  const mealTotals: NutrientValues[] = nutrition?.perMeal.map((meal) => roundedNutrients(meal.values)) ?? [];
  const target: NutrientTarget = {
    energyKcal: activeMealPlan?.target_energy_kcal ?? null,
    proteinG: activeMealPlan?.target_protein_g ?? null,
    carbohydrateG: activeMealPlan?.target_carbohydrate_g ?? null,
    fatG: activeMealPlan?.target_fat_g ?? null,
  };
  const targetComparison = nutrition ? compareTargetVsPrescribed(target, nutrition.total.values) : [];
  const recipeNamesByMealIndex = activeMealPlan
    ? await Promise.all(
        activeMealPlan.meals.map(async (meal) => (meal.source_recipe_id ? (await getRecipeById(meal.source_recipe_id))?.title ?? null : null))
      )
    : [];

  const substitutionsByBase = new Map<string, NonNullable<typeof activeMealPlan>["substitutions"]>();
  // Só substituições aprovadas pela nutricionista aparecem impressas —
  // sugestões da IA ainda pendentes de revisão nunca chegam ao paciente
  // (seção 16/20 do pedido: nenhuma sugestão clínica publicada sem revisão).
  for (const substitution of activeMealPlan?.substitutions ?? []) {
    if (substitution.approved_by_professional === false) continue;
    const current = substitutionsByBase.get(substitution.base_food) ?? [];
    current.push(substitution);
    substitutionsByBase.set(substitution.base_food, current);
  }

  const heightDisplay = formatHeightDisplay(nutritionRecord?.height_cm ?? null);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=Cormorant+Garamond:ital,wght@0,500;0,700;1,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Jost', sans-serif; background: #fff; color: #3A2B1F; font-size: 12px; line-height: 1.55; }
        h1, h2, h3 { font-family: 'Cormorant Garamond', serif; }
        .page { max-width: 780px; margin: 0 auto; padding: 32px 40px 48px; }

        /* Cabecalho compacto — nunca deve empurrar o conteudo pra pagina 2 */
        .doc-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 2px solid #EAD8C2; padding-bottom: 14px; margin-bottom: 18px; }
        .doc-header .brand-block { display: flex; align-items: center; gap: 10px; }
        .doc-header .brand-text p:first-child { font-size: 9px; letter-spacing: .16em; text-transform: uppercase; color: #7A9A74; font-weight: 600; }
        .doc-header .brand-text p:last-child { font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: #A8927D; }
        .doc-header .doc-meta { text-align: right; }
        .doc-header .doc-meta h1 { font-size: 20px; letter-spacing: .04em; color: #3A2B1F; }
        .doc-header .doc-meta p { font-size: 11px; color: #75675E; margin-top: 2px; }

        .section { margin-top: 24px; }
        .section-title { font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #B47F6A; border-bottom: 1px solid #EAD8C2; padding-bottom: 5px; margin-bottom: 10px; }
        .kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; }
        .kv-item label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #A8927D; display: block; }
        .kv-item span { font-weight: 500; color: #3A2B1F; }
        .card { background: #FAF7F2; border: 1px solid #EAD8C2; border-radius: 10px; padding: 12px 16px; margin-bottom: 10px; break-inside: avoid; }

        /* Refeicoes: cada bloco evita quebra sozinho, sem envolver o plano inteiro numa unica regra de avoid */
        .meal { border: 1px solid #EAD8C2; border-radius: 10px; margin-bottom: 10px; overflow: hidden; break-inside: avoid; }
        .meal-head { background: #FAF7F2; border-bottom: 1px solid #EAD8C2; padding: 8px 14px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .meal-time { font-size: 10px; font-weight: 700; color: #7A9A74; letter-spacing: .04em; }
        .meal-name { font-weight: 700; font-size: 12.5px; text-transform: uppercase; letter-spacing: .02em; }
        .meal-recipe { color: #8C5F50; font-size: 10px; margin-top: 2px; }
        .meal-body { padding: 8px 14px 10px; }
        .meal-item { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #F0E4D8; padding: 5px 0; }
        .meal-item:last-child { border-bottom: 0; }
        .meal-macros { margin-top: 6px; font-size: 10px; color: #8C6E52; }
        .meal-notice { margin-top: 6px; font-size: 10px; color: #B5762F; }

        .summary-card { break-inside: avoid; }
        .macro-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 10px 0; }
        .macro { border: 1px solid #EAD8C2; border-radius: 10px; padding: 8px; background: #FFFDFC; text-align: center; }
        .macro label { display: block; font-size: 8.5px; text-transform: uppercase; letter-spacing: .07em; color: #A8927D; }
        .macro strong { font-size: 15px; color: #3A2B1F; }

        .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
        .badge-green { background: #D4EDDA; color: #4A7C59; }
        .badge-sand { background: #EAD8C2; color: #8C6E52; }
        .badge-red { background: #fde8e8; color: #c0392b; }
        .badge-warn { background: #FFF1E6; color: #B5762F; }

        .subst-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; break-inside: avoid; }
        .subst-arrow { color: #B47F6A; font-weight: 700; }
        .subst-note { color: #A8927D; font-size: 10px; }

        .tl-item { display: flex; gap: 12px; margin-bottom: 10px; }
        .tl-dot { width: 10px; height: 10px; border-radius: 50%; background: #7A9A74; margin-top: 4px; flex-shrink: 0; }
        .tl-body p { font-size: 12px; }
        .tl-body small { color: #A8927D; font-size: 10px; }

        .doc-footer { margin-top: 32px; border-top: 1px solid #EAD8C2; padding-top: 12px; text-align: center; color: #A8927D; font-size: 9.5px; }

        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          @page { margin: 14mm 16mm; }
          .page { max-width: none; padding: 0; }
        }
      `}</style>

      <div className="no-print" style={{ padding: "16px 40px", background: "#FAF7F2", borderBottom: "1px solid #EAD8C2", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: "13px", color: "#8C6E52" }}>{onlyMealPlan ? "Plano alimentar" : "Relatório do cliente"} — {client.name}</p>
        <PrintButton />
      </div>

      <div className="page">
        {/* Cabecalho compacto — nao empurra conteudo pra pagina 2 */}
        <div className="doc-header">
          <div className="brand-block">
            <Image src="/brand/bruna-flores-nutri-logo.webp" alt="Bruna Flores Nutri" width={64} height={24} style={{ width: "64px", height: "auto" }} priority />
            <div className="brand-text">
              <p>Bruna Flores Nutri</p>
              <p>Nutrição Clínica</p>
            </div>
          </div>
          <div className="doc-meta">
            <h1>{onlyMealPlan ? "Plano Alimentar" : client.name}</h1>
            <p>{onlyMealPlan ? client.name : `Relatório · ${formatDate(new Date().toISOString())}`}</p>
            {onlyMealPlan && <p>{formatDate(new Date().toISOString())}</p>}
          </div>
        </div>

        {/* Dados do cliente */}
        {!onlyMealPlan && (
        <div className="section">
          <p className="section-title">Dados do cliente</p>
          <div className="kv">
            <div className="kv-item"><label>Nome</label><span>{client.name}</span></div>
            {client.email && <div className="kv-item"><label>E-mail</label><span>{client.email}</span></div>}
            {client.phone && <div className="kv-item"><label>Telefone</label><span>{client.phone}</span></div>}
            {client.birth_date && <div className="kv-item"><label>Nascimento</label><span>{formatDate(client.birth_date)}</span></div>}
            <div className="kv-item"><label>Status</label><span>{client.status}</span></div>
            <div className="kv-item"><label>Cadastro</label><span>{formatDate(client.created_at)}</span></div>
          </div>
          {client.notes && (
            <div className="card" style={{ marginTop: "12px" }}>
              <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: ".08em", color: "#A8927D", marginBottom: "4px" }}>Notas internas</p>
              <p>{client.notes}</p>
            </div>
          )}
        </div>
        )}

        {/* Formulario de origem */}
        {!onlyMealPlan && submission && Object.entries(submission.answers).some(([, value]) => typeof value === "string" && value.trim().length > 0) && (
          <div className="section">
            <p className="section-title">Formulário de pré-consulta</p>
            <div className="kv">
              {Object.entries(SUBMISSION_ANSWER_LABELS).map(([key, label]) => {
                const val = submission.answers[key];
                if (!val || typeof val !== "string" || !val.trim()) return null;
                return (
                  <div key={key} className="kv-item" style={{ gridColumn: SUBMISSION_LONG_TEXT_KEYS.has(key) ? "span 2" : undefined }}>
                    <label>{label}</label>
                    <span style={{ whiteSpace: "pre-wrap" }}>{val}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Prontuario nutricional */}
        {!onlyMealPlan && hasNutritionRecordContent(nutritionRecord) && nutritionRecord && (
          <div className="section">
            <p className="section-title">Prontuário nutricional</p>
            <div className="kv">
              {nutritionRecord.life_stage && <div className="kv-item"><label>Fase do cuidado</label><span>{nutritionRecord.life_stage}</span></div>}
              {nutritionRecord.biological_sex && <div className="kv-item"><label>Sexo biológico</label><span>{nutritionRecord.biological_sex}</span></div>}
              {nutritionRecord.gestational_weeks && <div className="kv-item"><label>Gestação</label><span>{nutritionRecord.gestational_weeks}</span></div>}
              {nutritionRecord.current_weight_kg && <div className="kv-item"><label>Peso atual</label><span>{nutritionRecord.current_weight_kg} kg</span></div>}
              {heightDisplay && <div className="kv-item"><label>Altura</label><span>{heightDisplay}</span></div>}
              {nutritionRecord.bmi && <div className="kv-item"><label>IMC</label><span>{nutritionRecord.bmi}</span></div>}
              {nutritionRecord.waist_cm && <div className="kv-item"><label>Cintura</label><span>{nutritionRecord.waist_cm} cm</span></div>}
              {nutritionRecord.target_weight_kg && <div className="kv-item"><label>Meta clínica</label><span>{nutritionRecord.target_weight_kg}</span></div>}
            </div>
            {[
              ["Motivo do acompanhamento", nutritionRecord.chief_complaint],
              ["Amamentação e contexto lactante", nutritionRecord.breastfeeding_context],
              ["Histórico clínico", nutritionRecord.clinical_history],
              ["Diagnósticos e antecedentes", nutritionRecord.diagnoses],
              ["Medicamentos", nutritionRecord.medications],
              ["Suplementos", nutritionRecord.supplements],
              ["Alergias e restrições", [nutritionRecord.allergies, nutritionRecord.restrictions].filter(Boolean).join("\n")],
              ["Rotina alimentar", nutritionRecord.eating_routine],
              ["Sinais gastrointestinais", nutritionRecord.intestinal_health],
              ["Sono, estresse e suporte", [nutritionRecord.sleep_routine, nutritionRecord.stress_context].filter(Boolean).join("\n")],
              ["Crescimento pediátrico", nutritionRecord.pediatric_growth_notes],
              ["Exames", nutritionRecord.exams],
              ["Avaliação nutricional", nutritionRecord.assessment],
              ["Objetivos", nutritionRecord.goals],
              ["Metas antropométricas e clínicas", nutritionRecord.target_notes],
              ["Plano de cuidado", nutritionRecord.care_plan],
              ["Sinais de atenção", nutritionRecord.risk_flags],
            ].map(([label, value]) => {
              if (!value) return null;
              return (
                <div key={String(label)} className="card" style={{ marginTop: "10px" }}>
                  <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: ".08em", color: "#A8927D", marginBottom: "4px" }}>{label}</p>
                  <p style={{ whiteSpace: "pre-wrap" }}>{value}</p>
                </div>
              );
            })}
          </div>
        )}

        {!onlyMealPlan && lastEvolution && (
          <div className="section">
            <p className="section-title">Última evolução registrada</p>
            <div className="card">
              <p style={{ fontSize: "10px", color: "#A8927D", marginBottom: "8px" }}>{formatDate(lastEvolution.created_at, "dd/MM/yyyy HH:mm")}</p>
              {lastEvolution.weight && <p><strong>Peso:</strong> {lastEvolution.weight}kg{lastEvolution.bmi ? ` · IMC: ${lastEvolution.bmi}` : ""}</p>}
              {lastEvolution.progress_notes && <p style={{ marginTop: "6px" }}><strong>Progressos:</strong> {lastEvolution.progress_notes}</p>}
              {lastEvolution.conduct_notes && <p style={{ marginTop: "6px" }}><strong>Conduta:</strong> {lastEvolution.conduct_notes}</p>}
              {lastEvolution.next_steps && <p style={{ marginTop: "6px" }}><strong>Próximos passos:</strong> {lastEvolution.next_steps}</p>}
            </div>
          </div>
        )}

        {/* No relatorio clinico interno, o plano aparece so como RESUMO — o
            cardapio completo (refeicao a refeicao) e material de entrega ao
            paciente e vive na outra impressao (?secao=plano-alimentar),
            nunca misturado aqui. */}
        {!onlyMealPlan && activeMealPlan && (
          <div className="section">
            <p className="section-title">Plano alimentar (resumo)</p>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: "13px" }}>{activeMealPlan.title}</p>
              <p style={{ color: "#8C6E52", fontSize: "10px", marginTop: "2px" }}>
                Versão {activeMealPlan.version} · {activeMealPlan.meals.length} refeição(ões) · Atualizado em {formatDate(activeMealPlan.updated_at)}
              </p>
              <div className="macro-grid">
                <div className="macro"><label>Energia</label><strong>{fmtKcal(planTotals?.energyKcal)} kcal</strong></div>
                <div className="macro"><label>Proteínas</label><strong>{fmtMacro(planTotals?.proteinG)} g</strong></div>
                <div className="macro"><label>Carboidratos</label><strong>{fmtMacro(planTotals?.carbohydrateG)} g</strong></div>
                <div className="macro"><label>Gorduras</label><strong>{fmtMacro(planTotals?.fatG)} g</strong></div>
                <div className="macro"><label>Fibras</label><strong>{fmtMacro(planTotals?.fiberG)} g</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* CARDAPIO — plano alimentar do paciente (secao=plano-alimentar) */}
        {onlyMealPlan && !activeMealPlan && (
          <div className="section">
            <p>Este paciente não tem um plano alimentar ativo no momento.</p>
          </div>
        )}
        {onlyMealPlan && activeMealPlan && (
          <>
            <div className="section summary-card">
              <p className="section-title">Resumo nutricional</p>
              <div className="macro-grid">
                <div className="macro"><label>Energia</label><strong>{fmtKcal(planTotals?.energyKcal)} kcal</strong></div>
                <div className="macro"><label>Proteínas</label><strong>{fmtMacro(planTotals?.proteinG)} g</strong></div>
                <div className="macro"><label>Carboidratos</label><strong>{fmtMacro(planTotals?.carbohydrateG)} g</strong></div>
                <div className="macro"><label>Gorduras</label><strong>{fmtMacro(planTotals?.fatG)} g</strong></div>
                <div className="macro"><label>Fibras</label><strong>{fmtMacro(planTotals?.fiberG)} g</strong></div>
              </div>
              {nutrition && nutrition.quality.total > 0 && nutrition.quality.unresolved > 0 && (
                <p style={{ color: "#8C5F50", fontSize: "10px" }}>
                  {nutrition.quality.unresolved} alimento(s) com informação nutricional incompleta.
                </p>
              )}
              {targetComparison.length > 0 && (
                <table style={{ width: "100%", marginTop: "10px", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #EAD8C2", textAlign: "left" }}>
                      <th style={{ padding: "4px 0", color: "#A8927D", fontWeight: 600, textTransform: "uppercase", fontSize: "9px" }}>Nutriente</th>
                      <th style={{ padding: "4px 0", color: "#A8927D", fontWeight: 600, textTransform: "uppercase", fontSize: "9px", textAlign: "right" }}>Plano</th>
                      <th style={{ padding: "4px 0", color: "#A8927D", fontWeight: 600, textTransform: "uppercase", fontSize: "9px", textAlign: "right" }}>Meta</th>
                      <th style={{ padding: "4px 0", color: "#A8927D", fontWeight: 600, textTransform: "uppercase", fontSize: "9px", textAlign: "right" }}>Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetComparison.map((row) => {
                      const fmt = row.nutrient === "energyKcal" ? fmtKcal : fmtMacro;
                      return (
                        <tr key={row.nutrient} style={{ borderBottom: "1px solid #F0E4D8" }}>
                          <td style={{ padding: "4px 0" }}>{NUTRIENT_LABELS_PT[row.nutrient] ?? row.nutrient}</td>
                          <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600 }}>{fmt(row.prescribed)}</td>
                          <td style={{ padding: "4px 0", textAlign: "right" }}>{fmt(row.target)}</td>
                          <td style={{ padding: "4px 0", textAlign: "right" }}>{row.diff === null ? "—" : `${row.diff > 0 ? "+" : ""}${fmt(row.diff)}`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="section">
              {activeMealPlan.meals.map((meal: MealPlanMealPayload, mealIndex: number) => {
                const macros = mealTotals[mealIndex];
                const recipeName = recipeNamesByMealIndex[mealIndex];
                const hasFoodItems = meal.items.some((item) => item.food.trim());
                const isIncomplete = hasFoodItems && (!macros || macros.energyKcal === null);
                return (
                  <div key={`${meal.name}-${mealIndex}`} className="meal">
                    <div className="meal-head">
                      <div>
                        {meal.suggested_time && <p className="meal-time">{meal.suggested_time}</p>}
                        <p className="meal-name">{meal.name}</p>
                        {recipeName && <p className="meal-recipe">Receita: {recipeName} · 1 porção</p>}
                      </div>
                      {hasFoodItems && (
                        isIncomplete
                          ? <span className="badge badge-warn">Informação incompleta</span>
                          : <span className="badge badge-green">{fmtKcal(macros?.energyKcal)} kcal</span>
                      )}
                    </div>
                    <div className="meal-body">
                      {isPatientFacingNote(meal.notes) && <p style={{ color: "#8C6E52", marginBottom: "6px", whiteSpace: "pre-wrap" }}>{meal.notes}</p>}
                      {meal.items.map((item, itemIndex) => (
                        <div key={`${item.food}-${itemIndex}`} className="meal-item">
                          <span>{item.food}{isPatientFacingNote(item.notes) ? ` - ${item.notes}` : ""}</span>
                          <strong>{fmtQuantity(item.quantity, item.unit)}</strong>
                        </div>
                      ))}
                      {!isIncomplete && macros && (
                        <p className="meal-macros">
                          P {fmtMacro(macros.proteinG)}g · C {fmtMacro(macros.carbohydrateG)}g · G {fmtMacro(macros.fatG)}g · Fibra {fmtMacro(macros.fiberG)}g
                        </p>
                      )}
                      {isIncomplete && (
                        <p className="meal-notice">Um ou mais alimentos desta refeição não têm correspondência na base de alimentos — confira no editor do plano.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {substitutionsByBase.size > 0 && (
              <div className="section">
                <p className="section-title">Opções de substituição</p>
                <div className="card">
                  {Array.from(substitutionsByBase.entries()).map(([baseFood, substitutions]) => (
                    <div key={baseFood} style={{ marginBottom: "8px" }}>
                      <p style={{ fontWeight: 600, margin: "0 0 2px" }}>{baseFood}</p>
                      <p style={{ margin: "0 0 4px", fontSize: "0.85em", color: "#75675E" }}>Pode substituir por UMA das opções abaixo:</p>
                      {substitutions.map((substitution, index) => (
                        <div key={`${baseFood}-${index}`} className="subst-row">
                          <span style={{ width: "14px", display: "inline-block" }} />
                          <span>• {substitution.option_food}{substitution.quantity ? ` — ${fmtQuantity(substitution.quantity, substitution.unit)}` : ""}</span>
                          {substitution.notes && <span className="subst-note">{substitution.notes}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeMealPlan.supplements.length > 0 && (
              <div className="section">
                <p className="section-title">Suplementos</p>
                <div className="card">
                  {activeMealPlan.supplements.map((supplement, index) => (
                    <div key={`${supplement.name}-${index}`} style={{ marginBottom: "6px" }}>
                      <p style={{ fontWeight: 700 }}>
                        {supplement.name}
                        {[supplement.dosage, supplement.unit].filter(Boolean).length ? ` — ${[supplement.dosage, supplement.unit].filter(Boolean).join(" ")}` : ""}
                      </p>
                      {supplement.instructions && <p className="subst-note">{supplement.instructions}</p>}
                      {supplement.notes && <p className="subst-note">{supplement.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isPatientFacingNote(activeMealPlan.notes) && (
              <div className="section">
                <p className="section-title">Orientações</p>
                <div className="card">
                  <p style={{ whiteSpace: "pre-wrap" }}>{activeMealPlan.notes}</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Protocolos */}
        {!onlyMealPlan && protocols.length > 0 && (
          <div className="section">
            <p className="section-title">Protocolos aplicados ({protocols.length})</p>
            {protocols.map((p) => (
              <div key={p.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{p.protocol_title ?? "Protocolo sem título"}</p>
                    {p.protocol_category && <p style={{ color: "#8C6E52", fontSize: "11px" }}>{p.protocol_category}</p>}
                    <p style={{ color: "#A8927D", fontSize: "10px", marginTop: "2px" }}>{p.protocol_kind === "personalized" ? "Personalizado" : "Padrão"}</p>
                  </div>
                  <span className={`badge ${p.status === "ativo" ? "badge-green" : "badge-sand"}`}>{p.status}</span>
                </div>
                <p style={{ color: "#A8927D", fontSize: "10px", marginTop: "4px" }}>
                  Iniciado em {formatDate(p.started_at)}
                  {p.completed_at ? ` · Concluído em ${formatDate(p.completed_at)}` : ""}
                  {p.review_date ? ` · Revisão em ${formatDate(p.review_date)}` : ""}
                </p>
                {p.professional_notes && <p style={{ marginTop: "6px", fontSize: "11px" }}><strong>Notas do acompanhamento:</strong> {p.professional_notes}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Tarefas */}
        {!onlyMealPlan && tasks.length > 0 && (
          <div className="section">
            <p className="section-title">Tarefas ({tasks.length})</p>
            {tasks.map((t) => (
              <div key={t.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ fontWeight: 500, textDecoration: t.status === "concluida" ? "line-through" : "none" }}>{t.title}</p>
                  {t.description && <p style={{ color: "#8C6E52", fontSize: "11px" }}>{t.description}</p>}
                  {t.due_date && <p style={{ color: "#A8927D", fontSize: "10px" }}>Prazo: {formatDate(t.due_date + "T00:00:00")}</p>}
                </div>
                <span className={`badge ${t.status === "concluida" ? "badge-green" : t.status === "cancelada" ? "badge-red" : "badge-sand"}`}>
                  {TASK_STATUS_LABELS[t.status] ?? t.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Todas as evolucoes */}
        {!onlyMealPlan && evolutions.length > 1 && (
          <div className="section">
            <p className="section-title">Histórico de evoluções ({evolutions.length})</p>
            {evolutions.map((ev) => (
              <div key={ev.id} className="card">
                <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "6px" }}>
                  <p style={{ fontSize: "10px", color: "#A8927D" }}>{formatDate(ev.created_at, "dd/MM/yyyy HH:mm")}</p>
                  {ev.weight && <span className="badge badge-green">{ev.weight}kg</span>}
                  {ev.bmi && <span className="badge badge-sand">IMC {ev.bmi}</span>}
                </div>
                {ev.symptoms && <p><strong>Sintomas:</strong> {ev.symptoms}</p>}
                {ev.progress_notes && <p><strong>Progressos:</strong> {ev.progress_notes}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Timeline — nunca no cardapio do paciente (onlyMealPlan), so no relatorio clinico interno */}
        {!onlyMealPlan && timeline.length > 0 && (
          <div className="section">
            <p className="section-title">Timeline do paciente</p>
            {timeline.map((event) => (
              <div key={event.id} className="tl-item">
                <div className="tl-dot" />
                <div className="tl-body">
                  <p>{TIMELINE_LABELS[event.type] ?? event.title}</p>
                  {event.description && <p style={{ color: "#8C6E52" }}>{event.description}</p>}
                  <small>{formatDate(event.created_at, "dd/MM/yyyy HH:mm")}</small>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rodape */}
        <div className="doc-footer">
          <p>Bruna Flores Nutri · Nutrição Clínica</p>
          <p style={{ marginTop: "2px" }}>Documento gerado em {formatDate(new Date().toISOString(), "dd/MM/yyyy HH:mm")}</p>
        </div>
      </div>
    </>
  );
}
