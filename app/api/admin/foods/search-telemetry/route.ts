import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { parseFoodSearchTelemetryEvent, recordFoodSearchTelemetry } from "@/lib/nutrition/food-search-telemetry";
import { getFoodSearchTelemetryAdapter } from "@/lib/nutrition/food-search-telemetry-runtime";

export const dynamic = "force-dynamic";

const clientEventTypes = new Set(["FOOD_SEARCH_RESULT_SELECTED", "FOOD_SEARCH_PORTION_SELECTED"]);
const prohibitedKeys = new Set(["patientId", "patient_id", "patientName", "patient_name", "consultationId", "consultation_id", "appointmentId", "appointment_id", "diagnosis", "notes", "clinicalNotes", "mealPlanId", "email", "phone"]);

function hasProhibitedKey(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value as Record<string, unknown>).some((key) => prohibitedKeys.has(key));
}

export async function POST(request: NextRequest) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ message: "Nao autenticado." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (hasProhibitedKey(body)) return NextResponse.json({ message: "Payload de telemetria invalido." }, { status: 400 });
  try {
    const event = parseFoodSearchTelemetryEvent(body);
    if (!clientEventTypes.has(event.type)) return NextResponse.json({ message: "Tipo de evento invalido." }, { status: 400 });
    const adapter = getFoodSearchTelemetryAdapter();
    if (adapter) await recordFoodSearchTelemetry(adapter, event);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ message: "Payload de telemetria invalido." }, { status: 400 });
  }
}
