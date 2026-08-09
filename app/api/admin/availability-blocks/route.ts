import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { createAvailabilityBlock, listAvailabilityBlocks } from "@/lib/repositories/availability";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BlockSchema = z.object({
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  reason: z.string().trim().max(300).nullable().optional(),
}).refine((data) => Date.parse(data.ends_at) > Date.parse(data.starts_at), {
  message: "Fim precisa ser maior que inicio.",
});

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const items = await listAvailabilityBlocks();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = BlockSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  const id = await createAvailabilityBlock(parsed.data);
  await writeAuditLog({
    action: "availability_block_created",
    adminId: admin.sub,
    entityType: "availability_block",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
  });
  return NextResponse.json({ id }, { status: 201 });
}
