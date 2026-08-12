import { NextResponse } from "next/server";
import { getIntakeAvailability } from "@/lib/ai/agents/patient/intake/intake-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const availability = await getIntakeAvailability();
    return NextResponse.json(availability);
  } catch {
    // Falha ao resolver config → indisponível (fallback seguro p/ formulário).
    return NextResponse.json({ available: false, mode: "optional", reason: "Indisponível." });
  }
}