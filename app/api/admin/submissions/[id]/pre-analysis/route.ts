import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getSubmissionById } from "@/lib/repositories/submissions";
import {
  getPreAnalysisBySubmissionId,
  upsertPreAnalysis,
} from "@/lib/repositories/pre-analyses";
import { preAnalysisSchema } from "@/lib/validators/pre-analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const preAnalysis = await getPreAnalysisBySubmissionId(id);
  return NextResponse.json(preAnalysis ?? null);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;

  const submission = await getSubmissionById(id);
  if (!submission) {
    return NextResponse.json({ message: "Formulário não encontrado." }, { status: 404 });
  }

  const body = await req.json();
  const parsed = preAnalysisSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Dados inválidos.";
    return NextResponse.json({ message: firstError }, { status: 400 });
  }

  const preAnalysisId = await upsertPreAnalysis({
    submission_id: id,
    admin_id: admin.sub,
    ...parsed.data,
  });

  return NextResponse.json({ success: true, preAnalysisId });
}
