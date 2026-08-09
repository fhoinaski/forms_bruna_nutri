import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { deleteAvailabilityBlock, updateAvailabilityBlock } from "@/lib/repositories/availability";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BlockSchema = z.object({
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  reason: z.string().trim().max(300).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "Informe ao menos um campo.",
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = BlockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  const { id } = await params;
  await updateAvailabilityBlock(id, parsed.data);
  await writeAuditLog({
    action: "availability_block_updated",
    adminId: admin.sub,
    entityType: "availability_block",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  await deleteAvailabilityBlock(id);
  await writeAuditLog({
    action: "availability_block_deleted",
    adminId: admin.sub,
    entityType: "availability_block",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
  });
  return NextResponse.json({ ok: true });
}
