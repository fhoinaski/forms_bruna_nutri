import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientById } from "@/lib/repositories/clients";
import { getExistingNutritionRecord } from "@/lib/repositories/nutrition-records";
import { getSubmissionById } from "@/lib/repositories/submissions";
import { buildMealPlanCopilotAnalysis } from "@/lib/clinical/meal-plan-copilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only, traceable pre-analysis. It neither calls AI nor persists data. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });
  const [record, submission] = await Promise.all([
    getExistingNutritionRecord(id),
    client.source_submission_id ? getSubmissionById(client.source_submission_id) : Promise.resolve(null),
  ]);
  return NextResponse.json(buildMealPlanCopilotAnalysis(record, submission?.answers ?? {}));
}
