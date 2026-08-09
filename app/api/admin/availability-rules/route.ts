import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { createAvailabilityRule, listAvailabilityRules } from "@/lib/repositories/availability";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const RuleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  start_time: TimeSchema,
  end_time: TimeSchema,
  slot_duration_minutes: z.number().int().min(15).max(240).default(60),
  is_active: z.number().int().min(0).max(1).default(1),
}).refine((data) => data.start_time < data.end_time, {
  message: "Horario final precisa ser maior que o inicial.",
});

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const items = await listAvailabilityRules();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = RuleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  const id = await createAvailabilityRule(parsed.data);
  await writeAuditLog({
    action: "availability_rule_created",
    adminId: admin.sub,
    entityType: "availability_rule",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
  });
  return NextResponse.json({ id }, { status: 201 });
}
