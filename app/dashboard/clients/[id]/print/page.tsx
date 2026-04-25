import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getClientById } from "@/lib/repositories/clients";
import { getClientProtocols } from "@/lib/repositories/client-protocols";
import { getClientTasks } from "@/lib/repositories/client-tasks";
import { getClientEvolutions } from "@/lib/repositories/client-evolutions";
import { getClientTimeline } from "@/lib/repositories/client-timeline";
import { getSubmissionById } from "@/lib/repositories/submissions";
import { jwtVerify } from "jose";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

const COOKIE_NAME = "admin_session";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "fallback-secret");

async function getAdminFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

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

export default async function ClientPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdminFromCookies();
  if (!admin) notFound();

  const { id } = await params;

  const [client, protocols, tasks, evolutions, timeline] = await Promise.all([
    getClientById(id),
    getClientProtocols(id),
    getClientTasks(id),
    getClientEvolutions(id),
    getClientTimeline(id),
  ]);

  if (!client) notFound();

  const submission = client.source_submission_id
    ? await getSubmissionById(client.source_submission_id)
    : null;

  const activeEvolutions = evolutions.filter((e) => e.weight || e.progress_notes);
  const lastEvolution = activeEvolutions[0];

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
        }
      `}</style>

      <div className="no-print" style={{ padding: "16px 40px", background: "#FAF7F2", borderBottom: "1px solid #EAD8C2", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: "13px", color: "#8C6E52" }}>Relatório do cliente — {client.name}</p>
        <PrintButton />
      </div>

      <div className="page">
        {/* Cabeçalho */}
        <div style={{ textAlign: "center", marginBottom: "32px", borderBottom: "2px solid #EAD8C2", paddingBottom: "24px" }}>
          <p style={{ fontSize: "10px", letterSpacing: ".2em", textTransform: "uppercase", color: "#7A9A74", marginBottom: "6px" }}>
            Bruna Flores Nutri · Nutrição Materna
          </p>
          <h1 style={{ fontSize: "28px", color: "#3A2B1F" }}>{client.name}</h1>
          <p style={{ color: "#A8927D", fontSize: "11px", marginTop: "4px" }}>
            Relatório gerado em {new Date().toLocaleDateString("pt-BR")}
          </p>
        </div>

        {/* Dados do cliente */}
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

        {/* Formulário de origem */}
        {submission && (
          <div className="section">
            <p className="section-title">Formulário de pré-consulta</p>
            <div className="kv">
              {(["motivacao", "objetivo", "tipoAtendimento", "diagnostico", "medicacao"] as string[]).map((key) => {
                const val = submission.answers[key];
                if (!val) return null;
                return (
                  <div key={key} className="kv-item" style={{ gridColumn: ["motivacao", "objetivo"].includes(key) ? "span 2" : undefined }}>
                    <label>{key}</label>
                    <span>{String(val)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Última evolução */}
        {lastEvolution && (
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

        {/* Protocolos */}
        {protocols.length > 0 && (
          <div className="section">
            <p className="section-title">Protocolos aplicados ({protocols.length})</p>
            {protocols.map((p) => (
              <div key={p.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{p.protocol_title ?? "Protocolo sem título"}</p>
                    {p.protocol_category && <p style={{ color: "#8C6E52", fontSize: "11px" }}>{p.protocol_category}</p>}
                  </div>
                  <span className={`badge ${p.status === "ativo" ? "badge-green" : "badge-sand"}`}>{p.status}</span>
                </div>
                <p style={{ color: "#A8927D", fontSize: "10px", marginTop: "4px" }}>
                  Iniciado em {formatDate(p.started_at)}
                  {p.completed_at ? ` · Concluído em ${formatDate(p.completed_at)}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Tarefas */}
        {tasks.length > 0 && (
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
        {evolutions.length > 1 && (
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
        {timeline.length > 0 && (
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
