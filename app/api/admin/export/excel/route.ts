import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getSubmissionsForExport, getDashboardMetrics } from "@/lib/repositories/submissions";
import { ExportFiltersSchema } from "@/lib/validators/admin";
import { format } from "date-fns";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANSWER_LABELS: Record<string, string> = {
  idade: "Idade",
  nascimento: "Nascimento",
  profissao: "Profissão",
  cidade: "Cidade",
  motivacao: "Motivação",
  objetivo: "Objetivo",
  incomodo: "Incômodo",
  diagnostico: "Diagnóstico",
  medicacao: "Medicação",
  anticoncepcional: "Anticoncepcional",
  gestante: "Gestante",
  sintomas: "Sintomas",
  suplementos: "Suplementos",
  suplementosNegativo: "Suplementos negativos",
  rotina: "Rotina",
  semComer: "Sem comer",
  comerEmocao: "Come por emoção",
  fomeDia: "Fome no dia",
  sonoHoras: "Horas de sono",
  descansada: "Descansada",
  estresse: "Estresse",
  atividadeFisica: "Atividade física",
  intestinoFreq: "Frequência intestinal",
  desconforto: "Desconforto",
  naoGosta: "Não gosta",
  favoritos: "Favoritos",
  diaAlimentar: "Dia alimentar",
  expectativas: "Expectativas",
  disposicao: "Disposição (0-10)",
  espacoLivre: "Espaço livre",
};

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const parsed = ExportFiltersSchema.safeParse({
    search: searchParams.get("search") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ message: "Filtros inválidos." }, { status: 400 });
  }

  const [submissions, metrics] = await Promise.all([
    getSubmissionsForExport(parsed.data),
    getDashboardMetrics(),
  ]);

  const wb = XLSX.utils.book_new();

  // Aba 1: Resumo
  const resumoData = [
    ["Relatório Bruna Flores Nutri", ""],
    ["Gerado em:", format(new Date(), "dd/MM/yyyy HH:mm")],
    ["", ""],
    ["Métrica", "Valor"],
    ["Total de formulários", metrics.total],
    ["Novos", metrics.novos],
    ["Últimos 7 dias", metrics.ultimos7dias],
    ["Finalizados", metrics.finalizados],
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumoData);
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  // Aba 2: Formulários
  const formHeaders = [
    "ID", "Data", "Nome", "E-mail", "Telefone",
    "Criança", "Idade Criança", "Tipo", "Status", "Notas",
  ];
  const formRows = submissions.map((s) => [
    s.id,
    format(new Date(s.created_at), "dd/MM/yyyy HH:mm"),
    s.patient_name,
    s.patient_email || "",
    s.patient_phone || "",
    s.child_name || "",
    s.child_age || "",
    s.form_type,
    s.status,
    s.notes || "",
  ]);
  const wsForm = XLSX.utils.aoa_to_sheet([formHeaders, ...formRows]);
  XLSX.utils.book_append_sheet(wb, wsForm, "Formulários");

  // Aba 3: Respostas completas
  const answerKeys = Array.from(
    new Set(submissions.flatMap((s) => Object.keys(s.answers)))
  );
  const answersHeaders = [
    "ID", "Nome", "Data",
    ...answerKeys.map((k) => ANSWER_LABELS[k] || k),
  ];
  const answersRows = submissions.map((s) => [
    s.id,
    s.patient_name,
    format(new Date(s.created_at), "dd/MM/yyyy HH:mm"),
    ...answerKeys.map((k) => s.answers[k] || ""),
  ]);
  const wsAnswers = XLSX.utils.aoa_to_sheet([answersHeaders, ...answersRows]);
  XLSX.utils.book_append_sheet(wb, wsAnswers, "Respostas completas");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const dateStr = format(new Date(), "yyyy-MM-dd");

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bruna-nutri-formularios-${dateStr}.xlsx"`,
    },
  });
}
