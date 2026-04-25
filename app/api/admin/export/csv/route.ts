import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getSubmissionsForExport } from "@/lib/repositories/submissions";
import { ExportFiltersSchema } from "@/lib/validators/admin";
import { format } from "date-fns";

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
  disposicao: "Disposição",
  espacoLivre: "Espaço livre",
};

function escapeCsv(val: string | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

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

  const submissions = await getSubmissionsForExport(parsed.data);

  const answerKeys = Array.from(
    new Set(submissions.flatMap((s) => Object.keys(s.answers)))
  );

  const headers = [
    "ID",
    "Data",
    "Nome",
    "E-mail",
    "Telefone",
    "Criança",
    "Idade Criança",
    "Tipo",
    "Status",
    "Notas",
    ...answerKeys.map((k) => ANSWER_LABELS[k] || k),
  ];

  const rows = submissions.map((s) => [
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
    ...answerKeys.map((k) => {
      const v = s.answers[k];
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return v.join(", ");
      return String(v);
    }),
  ]);

  const csvLines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ];

  const BOM = "﻿";
  const csvContent = BOM + csvLines.join("\n");
  const dateStr = format(new Date(), "yyyy-MM-dd");

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bruna-nutri-formularios-${dateStr}.csv"`,
    },
  });
}
