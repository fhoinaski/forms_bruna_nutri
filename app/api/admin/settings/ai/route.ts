import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AI_PROVIDERS } from "@/db/schema";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getAISettings, getPublicAISettings, updateAISettings } from "@/lib/repositories/ai-settings";
import { resolvePublicPreConsultationMode } from "@/lib/clinical/pre-consultation-mode";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  api_key: z.string().max(500).nullable().optional(),
  model: z.string().min(1).max(120),
  protocol_system_prompt: z.string().max(20000).nullable().optional(),
  chat_system_prompt: z.string().max(20000).nullable().optional(),
  patient_intake_mode: z.enum(["smart", "traditional"]).optional(),
}).strict();

async function publicSettingsResponse() {
  return {
    ...(await getPublicAISettings()),
    pre_consultation: await resolvePublicPreConsultationMode(),
  };
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  return NextResponse.json(await publicSettingsResponse());
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = UpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const previous = await getAISettings();
  const settings = await updateAISettings(parsed.data);
  const ipHash = getRequestFingerprint(req).ipHash;

  await writeAuditLog({
    action: "ai_settings_updated",
    adminId: admin.sub,
    entityType: "ai_settings",
    entityId: "default",
    ipHash,
    metadata: {
      provider: settings.provider,
      model: settings.model,
      patientIntakeMode: settings.patient_intake_mode,
      apiKeyChanged: parsed.data.api_key ? !parsed.data.api_key.includes("...") : false,
    },
  });

  if (parsed.data.patient_intake_mode && parsed.data.patient_intake_mode !== previous.patient_intake_mode) {
    await writeAuditLog({
      action: "pre_consultation_mode_changed",
      adminId: admin.sub,
      entityType: "ai_settings",
      entityId: "default",
      ipHash,
      metadata: {
        oldMode: previous.patient_intake_mode,
        newMode: settings.patient_intake_mode,
      },
    });
  }

  return NextResponse.json(await publicSettingsResponse());
}
