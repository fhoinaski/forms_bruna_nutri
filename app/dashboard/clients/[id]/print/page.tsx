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
import { getActiveMealPlan } from "@/lib/repositories/meal-plans";
import { estimateFoodMacrosFromTaco } from "@/lib/nutrition/taco";
import { roundedMacros, sumMacros } from "@/lib/nutrition/macros";
import { PrintButton } from "./PrintButton";

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
  const mealMacros = activeMealPlan?.meals.map((meal) => roundedMacros(sumMacros(
    meal.items.map((item) => estimateFoodMacrosFromTaco(item.food, item.quantity, item.unit))
  ))) ?? [];
  const planMacros = roundedMacros(sumMacros(mealMacros));
  const substitutionsByBase = new Map<string, NonNullable<typeof activeMealPlan>["substitutions"]>();
  for (const substitution of activeMealPlan?.substitutions ?? []) {
    const current = substitutionsByBase.get(substitution.base_food) ?? [];
    current.push(substitution);
    substitutionsByBase.set(substitution.base_food, current);
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=Cormorant+Garamond:ital,wght@0,500;0,700;1,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Jost', sans-serif; background: #fff; color: #3A2B1F; font-size: 12px; line-height: 1.6; }
        h1, h2, h3 { font-family: 'Cormorant Garamond', serif; }
        .page { max-width: 780px; margin: 0 auto; padding: 48px 40px; }
        .section { margin-top: 32px; page-break-inside: avoid; }
        .section-title { font-size: 15px; font-weight: 700; color: #B47F6A; border-bottom: 1px solid #EAD8C2; padding-bottom: 6px; margin-bottom: 12px; }
        .kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; }
        .kv-item label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #A8927D; display: block; }
        .kv-item span { font-weight: 500; color: #3A2B1F; }
        .card { background: #FAF7F2; border: 1px solid #EAD8C2; border-radius: 10px; padding: 12px 16px; margin-bottom: 10px; }
        .meal { border: 1px solid #EAD8C2; border-radius: 12px; margin-bottom: 12px; overflow: hidden; page-break-inside: avoid; }
        .meal-head { background: #FAF7F2; border-bottom: 1px solid #EAD8C2; padding: 10px 14px; display: flex; justify-content: space-between; gap: 12px; }
        .meal-body { padding: 10px 14px; }
        .meal-item { display: flex; justify-content: space-between; gap: 16px; border-bottom: 1px solid #F0E4D8; padding: 7px 0; }
        .meal-item:last-child { border-bottom: 0; }
        .macro-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
        .macro { border: 1px solid #EAD8C2; border-radius: 10px; padding: 8px; background: #FFFDFC; }
        .macro label { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #A8927D; }
        .macro strong { font-size: 14px; color: #3A2B1F; }
        .badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
        .badge-green { background: #D4EDDA; color: #4A7C59; }
        .badge-sand { background: #EAD8C2; color: #8C6E52; }
        .badge-red { background: #fde8e8; color: #c0392b; }
        .tl-item { display: flex; gap: 12px; margin-bottom: 10px; }
        .tl-dot { width: 10px; height: 10px; border-radius: 50%; background: #7A9A74; margin-top: 4px; flex-shrink: 0; }
        .tl-body p { font-size: 12px; }
        .tl-body small { color: #A8927D; font-size: 10px; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          @page { margin: 14mm; }
          .page { max-width: none; padding: 0; }
        }
      `}</style>

      <div className="no-print" style={{ padding: "16px 40px", background: "#FAF7F2", borderBottom: "1px solid #EAD8C2", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: "13px", color: "#8C6E52" }}>{onlyMealPlan ? "Plano alimentar" : "Relatório do cliente"} — {client.name}</p>
        <PrintButton />
      </div>

      <div className="page">
        {/* Cabeçalho */}
        <div style={{ textAlign: "center", marginBottom: "32px", borderBottom: "2px solid #EAD8C2", paddingBottom: "24px" }}>
          <Image src="/brand/bruna-flores-nutri-logo.webp" alt="Bruna Flores Nutri" width={150} height={57} style={{ width: "150px", height: "auto", margin: "0 auto 14px" }} priority />
          <p style={{ fontSize: "10px", letterSpacing: ".2em", textTransform: "uppercase", color: "#7A9A74", marginBottom: "6px" }}>
            Bruna Flores Nutri · Nutrição Materna
          </p>
          <h1 style={{ fontSize: "28px", color: "#3A2B1F" }}>{client.name}</h1>
          <p style={{ color: "#A8927D", fontSize: "11px", marginTop: "4px" }}>
            Relatório gerado em {new Date().toLocaleDateString("pt-BR")}
          </p>
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

        {/* Formulário de origem */}
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

        {/* Última evolução */}
        {!onlyMealPlan && hasNutritionRecordContent(nutritionRecord) && nutritionRecord && (
          <div className="section">
            <p className="section-title">Prontuario nutricional</p>
            <div className="kv">
              {nutritionRecord.life_stage && <div className="kv-item"><label>Fase do cuidado</label><span>{nutritionRecord.life_stage}</span></div>}
              {nutritionRecord.biological_sex && <div className="kv-item"><label>Sexo biologico</label><span>{nutritionRecord.biological_sex}</span></div>}
              {nutritionRecord.gestational_weeks && <div className="kv-item"><label>Gestacao</label><span>{nutritionRecord.gestational_weeks}</span></div>}
              {nutritionRecord.current_weight_kg && <div className="kv-item"><label>Peso atual</label><span>{nutritionRecord.current_weight_kg} kg</span></div>}
              {nutritionRecord.height_cm && <div className="kv-item"><label>Altura</label><span>{nutritionRecord.height_cm} cm</span></div>}
              {nutritionRecord.bmi && <div className="kv-item"><label>IMC</label><span>{nutritionRecord.bmi}</span></div>}
              {nutritionRecord.waist_cm && <div className="kv-item"><label>Cintura</label><span>{nutritionRecord.waist_cm} cm</span></div>}
              {nutritionRecord.target_weight_kg && <div className="kv-item"><label>Meta clinica</label><span>{nutritionRecord.target_weight_kg}</span></div>}
            </div>
            {[
              ["Motivo do acompanhamento", nutritionRecord.chief_complaint],
              ["Amamentacao e contexto lactante", nutritionRecord.breastfeeding_context],
              ["Historico clinico", nutritionRecord.clinical_history],
              ["Diagnosticos e antecedentes", nutritionRecord.diagnoses],
              ["Medicamentos", nutritionRecord.medications],
              ["Suplementos", nutritionRecord.supplements],
              ["Alergias e restricoes", [nutritionRecord.allergies, nutritionRecord.restrictions].filter(Boolean).join("\n")],
              ["Rotina alimentar", nutritionRecord.eating_routine],
              ["Sinais gastrointestinais", nutritionRecord.intestinal_health],
              ["Sono, estresse e suporte", [nutritionRecord.sleep_routine, nutritionRecord.stress_context].filter(Boolean).join("\n")],
              ["Crescimento pediatrico", nutritionRecord.pediatric_growth_notes],
              ["Exames", nutritionRecord.exams],
              ["Avaliacao nutricional", nutritionRecord.assessment],
              ["Objetivos", nutritionRecord.goals],
              ["Metas antropometricas e clinicas", nutritionRecord.target_notes],
              ["Plano de cuidado", nutritionRecord.care_plan],
              ["Sinais de atencao", nutritionRecord.risk_flags],
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

        {/* Plano alimentar ativo */}
        {onlyMealPlan && !activeMealPlan && (
          <div className="section">
            <p className="section-title">Plano alimentar</p>
            <p>Este paciente não tem um plano alimentar ativo no momento.</p>
          </div>
        )}
        {activeMealPlan && (
          <div className="section">
            <p className="section-title">Plano alimentar ativo</p>
            <div className="card">
              <p style={{ fontWeight: 700, fontSize: "14px" }}>{activeMealPlan.title}</p>
              {activeMealPlan.notes && <p style={{ marginTop: "6px", whiteSpace: "pre-wrap" }}>{activeMealPlan.notes}</p>}
              <div className="macro-grid">
                <div className="macro"><label>Energia</label><strong>{planMacros.kcal} kcal</strong></div>
                <div className="macro"><label>Proteinas</label><strong>{planMacros.protein} g</strong></div>
                <div className="macro"><label>Carboidratos</label><strong>{planMacros.carbs} g</strong></div>
                <div className="macro"><label>Gorduras</label><strong>{planMacros.fat} g</strong></div>
              </div>
              {planMacros.totalItems > 0 && planMacros.recognizedItems < planMacros.totalItems && (
                <p style={{ color: "#8C5F50", fontSize: "10px" }}>
                  {planMacros.totalItems - planMacros.recognizedItems} alimento(s) sem correspondencia automatica na TACO.
                </p>
              )}
            </div>
            {activeMealPlan.meals.map((meal, mealIndex) => (
              <div key={`${meal.name}-${mealIndex}`} className="meal">
                <div className="meal-head">
                  <div>
                    <p style={{ fontWeight: 700 }}>{meal.name}</p>
                    {meal.suggested_time && <p style={{ color: "#8C6E52", fontSize: "10px" }}>Horario sugerido: {meal.suggested_time}</p>}
                  </div>
                  <span className="badge badge-green">{mealMacros[mealIndex]?.kcal ?? 0} kcal</span>
                </div>
                <div className="meal-body">
                  {meal.notes && <p style={{ color: "#8C6E52", marginBottom: "6px", whiteSpace: "pre-wrap" }}>{meal.notes}</p>}
                  {meal.items.map((item, itemIndex) => (
                    <div key={`${item.food}-${itemIndex}`} className="meal-item">
                      <span>{item.food}{item.notes ? ` - ${item.notes}` : ""}</span>
                      <strong>{[item.quantity, item.unit].filter(Boolean).join(" ") || "Porcao individual"}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {substitutionsByBase.size > 0 && (
              <div className="card">
                <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: ".08em", color: "#A8927D", marginBottom: "8px" }}>Substituicoes</p>
                {Array.from(substitutionsByBase.entries()).map(([baseFood, substitutions]) => (
                  <div key={baseFood} style={{ marginBottom: "8px" }}>
                    <p style={{ fontWeight: 700 }}>{baseFood}</p>
                    <ul style={{ paddingLeft: "18px" }}>
                      {substitutions.map((substitution, index) => (
                        <li key={`${baseFood}-${index}`}>
                          {substitution.option_food} {[substitution.quantity, substitution.unit].filter(Boolean).join(" ")}
                          {substitution.notes ? ` - ${substitution.notes}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {activeMealPlan.supplements.length > 0 && (
              <div className="card">
                <p style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: ".08em", color: "#A8927D", marginBottom: "8px" }}>Suplementos</p>
                {activeMealPlan.supplements.map((supplement, index) => (
                  <p key={`${supplement.name}-${index}`}>
                    <strong>{supplement.name}</strong>
                    {[supplement.dosage, supplement.unit].filter(Boolean).length ? ` - ${[supplement.dosage, supplement.unit].filter(Boolean).join(" ")}` : ""}
                    {supplement.instructions ? ` - ${supplement.instructions}` : ""}
                    {supplement.notes ? ` (${supplement.notes})` : ""}
                  </p>
                ))}
              </div>
            )}
          </div>
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

        {/* Todas as evoluções */}
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

        {/* Timeline */}
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

        {/* Rodapé */}
        <div style={{ marginTop: "48px", borderTop: "1px solid #EAD8C2", paddingTop: "16px", textAlign: "center", color: "#A8927D", fontSize: "10px" }}>
          <p>Bruna Flores Nutri · Nutrição Materna e Infantil</p>
          <p style={{ marginTop: "2px" }}>Documento gerado em {new Date().toLocaleString("pt-BR")}</p>
        </div>
      </div>
    </>
  );
}
