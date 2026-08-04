import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import ExcelJS from "exceljs";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getDashboardMetrics, getSubmissionsForExport } from "@/lib/repositories/submissions";
import { ExportFiltersSchema } from "@/lib/validators/admin";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANSWER_LABELS: Record<string, string> = {
  tipoAtendimento: "Tipo de atendimento", idade: "Idade", nascimento: "Nascimento",
  profissao: "Profissão", cidade: "Cidade", motivacao: "Motivação", objetivo: "Objetivo",
  incomodo: "Incômodo", diagnostico: "Diagnóstico", medicacao: "Medicação",
  anticoncepcional: "Anticoncepcional", gestante: "Gestante", sintomas: "Sintomas",
  suplementos: "Suplementos", suplementosNegativo: "Suplementos negativos", rotina: "Rotina",
  semComer: "Sem comer", comerEmocao: "Come por emoção", fomeDia: "Fome no dia",
  sonoHoras: "Horas de sono", descansada: "Descansada", estresse: "Estresse",
  atividadeFisica: "Atividade física", intestinoFreq: "Frequência intestinal",
  desconforto: "Desconforto", naoGosta: "Não gosta", favoritos: "Favoritos",
  diaAlimentar: "Dia alimentar", expectativas: "Expectativas",
  disposicao: "Disposição (0-10)", espacoLivre: "Espaço livre",
};

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const { searchParams } = req.nextUrl;
  const parsed = ExportFiltersSchema.safeParse({ search: searchParams.get("search") ?? undefined, status: searchParams.get("status") ?? undefined, from: searchParams.get("from") ?? undefined, to: searchParams.get("to") ?? undefined });
  if (!parsed.success) return NextResponse.json({ message: "Filtros inválidos." }, { status: 400 });

  const [submissions, metrics] = await Promise.all([getSubmissionsForExport(parsed.data), getDashboardMetrics()]);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bruna Flores Nutri";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Resumo");
  summary.addRows([["Relatório Bruna Flores Nutri", ""], ["Gerado em:", format(new Date(), "dd/MM/yyyy HH:mm")], ["", ""], ["Métrica", "Valor"], ["Total de formulários", metrics.total], ["Novos", metrics.novos], ["Últimos 7 dias", metrics.ultimos7dias], ["Finalizados", metrics.finalizados]]);
  summary.columns = [{ width: 30 }, { width: 22 }];

  const formHeaders = ["ID", "Data", "Nome", "E-mail", "Telefone", "Criança", "Idade Criança", "Tipo", "Status", "Notas"];
  const forms = workbook.addWorksheet("Formulários");
  forms.addRows([formHeaders, ...submissions.map((item) => [item.id, format(new Date(item.created_at), "dd/MM/yyyy HH:mm"), item.patient_name, item.patient_email || "", item.patient_phone || "", item.child_name || "", item.child_age || "", item.form_type, item.status, item.notes || ""])]);
  forms.views = [{ state: "frozen", ySplit: 1 }];
  forms.columns = formHeaders.map((header) => ({ width: Math.max(14, Math.min(34, header.length + 8)) }));

  const answerKeys = Array.from(new Set(submissions.flatMap((item) => Object.keys(item.answers))));
  const answersHeaders = ["ID", "Nome", "Data", ...answerKeys.map((key) => ANSWER_LABELS[key] || key)];
  const answers = workbook.addWorksheet("Respostas completas");
  answers.addRows([answersHeaders, ...submissions.map((item) => [item.id, item.patient_name, format(new Date(item.created_at), "dd/MM/yyyy HH:mm"), ...answerKeys.map((key) => { const value = item.answers[key]; if (value === null || value === undefined) return ""; return Array.isArray(value) ? value.join(", ") : String(value); })])]);
  answers.views = [{ state: "frozen", ySplit: 1 }];
  answers.columns = answersHeaders.map(() => ({ width: 24 }));

  for (const worksheet of workbook.worksheets) {
    const header = worksheet.getRow(worksheet.name === "Resumo" ? 4 : 1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF607A56" } };
    worksheet.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await writeAuditLog({ action: "sensitive_data_exported", adminId: admin.sub, entityType: "form_submissions", ipHash: getRequestFingerprint(req).ipHash, metadata: { format: "xlsx", records: submissions.length } });
  return new NextResponse(buffer, { status: 200, headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="bruna-nutri-formularios-${format(new Date(), "yyyy-MM-dd")}.xlsx"`, "Cache-Control": "no-store" } });
}
