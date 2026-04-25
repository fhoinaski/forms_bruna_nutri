import { getSubmissionById } from "@/lib/repositories/submissions";
import { format, parseISO } from "date-fns";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const ANSWER_SECTIONS = [
  {
    title: "Dados Pessoais",
    fields: [
      { key: "idade", label: "Idade" },
      { key: "nascimento", label: "Data de nascimento" },
      { key: "profissao", label: "Profissão" },
      { key: "cidade", label: "Cidade/Estado" },
    ],
  },
  {
    title: "Momento Atual",
    fields: [
      { key: "motivacao", label: "Motivação" },
      { key: "objetivo", label: "Objetivo principal" },
      { key: "incomodo", label: "O que mais incomoda" },
    ],
  },
  {
    title: "Histórico de Saúde",
    fields: [
      { key: "diagnostico", label: "Diagnóstico" },
      { key: "medicacao", label: "Medicação contínua" },
      { key: "anticoncepcional", label: "Anticoncepcional" },
      { key: "gestante", label: "Gestante/Amamentando" },
      { key: "sintomas", label: "Sintomas frequentes" },
    ],
  },
  {
    title: "Suplementação",
    fields: [
      { key: "suplementos", label: "Uso atual" },
      { key: "suplementosNegativo", label: "Não se adaptou" },
    ],
  },
  {
    title: "Rotina Alimentar",
    fields: [
      { key: "rotina", label: "Rotina descrita" },
      { key: "semComer", label: "Fica longo tempo sem comer" },
      { key: "comerEmocao", label: "Come por fome/emoção" },
      { key: "fomeDia", label: "Fome ao longo do dia" },
    ],
  },
  {
    title: "Sono, Estresse e Rotina",
    fields: [
      { key: "sonoHoras", label: "Horas de sono" },
      { key: "descansada", label: "Acorda descansada" },
      { key: "estresse", label: "Nível de estresse" },
      { key: "atividadeFisica", label: "Atividade física" },
    ],
  },
  {
    title: "Saúde Intestinal",
    fields: [
      { key: "intestinoFreq", label: "Frequência" },
      { key: "desconforto", label: "Gases/Desconforto" },
    ],
  },
  {
    title: "Preferências",
    fields: [
      { key: "naoGosta", label: "Não gosta/tolera" },
      { key: "favoritos", label: "Favoritos no dia a dia" },
    ],
  },
  {
    title: "Dia Alimentar",
    fields: [{ key: "diaAlimentar", label: "Relato" }],
  },
  {
    title: "Expectativas",
    fields: [
      { key: "expectativas", label: "O que espera?" },
      { key: "disposicao", label: "Disposição para mudar (0-10)" },
    ],
  },
  {
    title: "Espaço Livre",
    fields: [{ key: "espacoLivre", label: "Mensagem" }],
  },
];

export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const submission = await getSubmissionById(id);
  if (!submission) notFound();

  const dateStr = format(parseISO(submission.created_at), "dd/MM/yyyy 'às' HH:mm");

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Formulário — ${submission.patient_name}`}</title>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Jost:wght@300;400;500&display=swap');

          * { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            font-family: 'Jost', sans-serif;
            font-weight: 300;
            background: #fff;
            color: #3A2B1F;
            font-size: 13px;
            line-height: 1.6;
          }

          .page {
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 32px 60px;
          }

          .header {
            text-align: center;
            padding-bottom: 24px;
            border-bottom: 2px solid #EAD8C2;
            margin-bottom: 32px;
          }

          .header .brand {
            font-family: 'Jost', sans-serif;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            color: #7A9A74;
            margin-bottom: 8px;
          }

          .header h1 {
            font-family: 'Cormorant Garamond', serif;
            font-size: 28px;
            font-weight: 600;
            color: #7A9A74;
            margin-bottom: 4px;
          }

          .header .meta {
            font-size: 11px;
            color: #A8927D;
            margin-top: 4px;
          }

          .patient-info {
            background: #FAF7F2;
            border: 1px solid #EAD8C2;
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 32px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }

          .patient-info .info-row {
            display: flex;
            flex-direction: column;
          }

          .patient-info .info-label {
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            color: #B47F6A;
            font-weight: 500;
            margin-bottom: 2px;
          }

          .patient-info .info-value {
            font-size: 13px;
            color: #3A2B1F;
          }

          .section {
            margin-bottom: 28px;
            page-break-inside: avoid;
          }

          .section-title {
            font-family: 'Cormorant Garamond', serif;
            font-size: 16px;
            font-weight: 600;
            color: #B47F6A;
            border-bottom: 1px solid #EAD8C2;
            padding-bottom: 6px;
            margin-bottom: 14px;
          }

          .answer-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
          }

          .answer-item {
            break-inside: avoid;
          }

          .answer-item.full {
            grid-column: 1 / -1;
          }

          .answer-label {
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            color: #B47F6A;
            font-weight: 500;
            margin-bottom: 4px;
          }

          .answer-value {
            background: #FAF7F2;
            border: 1px solid #EAD8C2;
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 12px;
            color: #3A2B1F;
            white-space: pre-wrap;
            line-height: 1.5;
          }

          .footer {
            margin-top: 48px;
            padding-top: 20px;
            border-top: 1px solid #EAD8C2;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            color: #A8927D;
          }

          .print-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #7A9A74;
            color: #fff;
            border: none;
            padding: 10px 20px;
            border-radius: 20px;
            font-family: 'Jost', sans-serif;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            letter-spacing: 0.05em;
            box-shadow: 0 2px 10px rgba(122,154,116,0.3);
          }

          .print-btn:hover { background: #688a62; }

          @media print {
            .print-btn { display: none; }
            body { font-size: 12px; }
            .page { padding: 20px 24px 40px; }
          }
        `}</style>
      </head>
      <body>
        <button className="print-btn" onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </button>

        <div className="page">
          <div className="header">
            <div className="brand">Bruna Flores Nutri — Nutrição Materna</div>
            <h1>Formulário Pré-Consulta</h1>
            <div className="meta">Paciente: {submission.patient_name}</div>
            <div className="meta">Recebido em {dateStr}</div>
          </div>

          <div className="patient-info">
            <div className="info-row">
              <span className="info-label">Nome</span>
              <span className="info-value">{submission.patient_name}</span>
            </div>
            {submission.patient_phone && (
              <div className="info-row">
                <span className="info-label">Telefone</span>
                <span className="info-value">{submission.patient_phone}</span>
              </div>
            )}
            {submission.patient_email && (
              <div className="info-row">
                <span className="info-label">E-mail</span>
                <span className="info-value">{submission.patient_email}</span>
              </div>
            )}
            {submission.child_name && (
              <div className="info-row">
                <span className="info-label">Criança</span>
                <span className="info-value">
                  {submission.child_name}
                  {submission.child_age ? ` (${submission.child_age})` : ""}
                </span>
              </div>
            )}
            <div className="info-row">
              <span className="info-label">Status</span>
              <span className="info-value">{submission.status}</span>
            </div>
          </div>

          {ANSWER_SECTIONS.map((section) => {
            const hasAny = section.fields.some(
              (f) => submission.answers[f.key]
            );
            if (!hasAny) return null;
            return (
              <div key={section.title} className="section">
                <div className="section-title">{section.title}</div>
                <div className="answer-grid">
                  {section.fields.map((f) =>
                    submission.answers[f.key] ? (
                      <div
                        key={f.key}
                        className={`answer-item${section.fields.length === 1 ? " full" : ""}`}
                      >
                        <div className="answer-label">{f.label}</div>
                        <div className="answer-value">
                          {submission.answers[f.key]}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            );
          })}

          {submission.notes && (
            <div className="section">
              <div className="section-title">Notas Internas</div>
              <div className="answer-grid">
                <div className="answer-item full">
                  <div className="answer-value">{submission.notes}</div>
                </div>
              </div>
            </div>
          )}

          <div className="footer">
            <span>Bruna Flores Nutri © {new Date().getFullYear()}</span>
            <span>
              Gerado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
            </span>
          </div>
        </div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.querySelector('.print-btn')?.addEventListener('click', () => window.print());
            `,
          }}
        />
      </body>
    </html>
  );
}
