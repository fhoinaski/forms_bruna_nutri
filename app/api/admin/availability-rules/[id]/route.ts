import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { deleteAvailabilityRule, updateAvailabilityRule } from "@/lib/repositories/availability";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const RuleSchema = z.object({
  weekday: z.number().int().min(0).max(6).optional(),
  start_time: TimeSchema.optional(),
  end_time: TimeSchema.optional(),
  slot_duration_minutes: z.number().int().min(15).max(240).optional(),
  is_active: z.number().int().min(0).max(1).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Informe ao menos um campo.",
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = RuleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  const { id } = await params;
  await updateAvailabilityRule(id, parsed.data);
  await writeAuditLog({
    action: "availability_rule_updated",
    adminId: admin.sub,
    entityType: "availability_rule",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  await deleteAvailabilityRule(id);
  await writeAuditLog({
    action: "availability_rule_deleted",
    adminId: admin.sub,
    entityType: "availability_rule",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
  });
  return NextResponse.json({ ok: true });
}
