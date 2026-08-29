import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getTemplateById } from "@/lib/repositories/protocol-templates";
import { getTemplateFlatMeals } from "@/lib/repositories/meal-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * R4 (seções 8-9/30-31) — refeições prescritas de um modelo de plano
 * (`protocol_templates` tipo DIETA), já no formato pronto pra entrar no
 * draft local do Composer ("Modelos de planos" na biblioteca de reuso).
 * Rota paralela a `/structure` (que devolve slots pra o wizard "criar por
 * modelo") — esta devolve a prescrição FLAT, mesma fonte de dados que
 * `createMealPlanFromTemplates` já usa internamente, nunca uma segunda
 * leitura de diet_template_meals/items.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const template = await getTemplateById(id);
  if (!template) return NextResponse.json({ message: "Modelo não encontrado." }, { status: 404 });

  const meals = await getTemplateFlatMeals(id);
  return NextResponse.json({
    template: { id: template.id, title: template.title, target_group: template.target_group, type: template.type },
    meals,
  });
}
