import { NextRequest, NextResponse } from "next/server";
import { readE2EIntakeModeOverride, resolvePublicPreConsultationMode } from "@/lib/clinical/pre-consultation-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const resolution = await resolvePublicPreConsultationMode(readE2EIntakeModeOverride(req.headers));
    return NextResponse.json({
      configuredMode: resolution.configuredMode,
      effectiveMode: resolution.effectiveMode,
      aiAvailable: resolution.aiAvailable,
      reason: resolution.reason ?? null,
      // Compatibilidade com consumidores antigos (available/mode).
      available: resolution.effectiveMode === "smart",
      mode: resolution.configuredMode,
    });
  } catch {
    // Falha ao resolver config → tradicional (fallback seguro p/ formulário).
    return NextResponse.json({
      configuredMode: "traditional",
      effectiveMode: "traditional",
      aiAvailable: false,
      reason: "indisponivel",
      available: false,
      mode: "traditional",
    });
  }
}