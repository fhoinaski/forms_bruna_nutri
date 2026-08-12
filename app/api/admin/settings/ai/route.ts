import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AI_PROVIDERS } from "@/db/schema";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getPublicAISettings, updateAISettings } from "@/lib/repositories/ai-settings";
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
  patient_intake_ai_enabled: z.boolean().optional(),
  patient_intake_mode: z.enum(["optional", "default"]).optional(),
}).strict();

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  return NextResponse.json(await getPublicAISettings());
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = UpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const settings = await updateAISettings(parsed.data);
  await writeAuditLog({
    action: "ai_settings_updated",
    adminId: admin.sub,
    entityType: "ai_settings",
    entityId: "default",
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: {
      provider: settings.provider,
      model: settings.model,
      patientIntakeAiEnabled: parsed.data.patient_intake_ai_enabled ?? settings.patient_intake_ai_enabled === 1,
      patientIntakeMode: parsed.data.patient_intake_mode ?? settings.patient_intake_mode,
      apiKeyChanged: parsed.data.api_key ? !parsed.data.api_key.includes("...") : false,
    },
  });

  return NextResponse.json(await getPublicAISettings());
}
