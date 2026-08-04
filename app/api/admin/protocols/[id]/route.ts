import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getProtocolById, updateProtocol, archiveProtocol, replaceProtocolPhases } from "@/lib/repositories/protocols";
import { z } from "zod";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  archive: z.boolean().optional(),
  phases: z.array(z.object({
    title: z.string().min(1).max(500),
    days: z.string().max(50).optional().nullable(),
    objective: z.string().max(2000).optional().nullable(),
    actions: z.array(z.string().min(1).max(1000)).max(50),
    notes: z.string().max(2000).optional().nullable(),
  })).max(30).optional(),
}).strict();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const protocol = await getProtocolById(id);
  if (!protocol) return NextResponse.json({ message: "Protocolo não encontrado." }, { status: 404 });

  return NextResponse.json(protocol);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const protocol = await getProtocolById(id);
  if (!protocol) return NextResponse.json({ message: "Protocolo não encontrado." }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  if (parsed.data.archive) {
    await archiveProtocol(id);
  } else {
    await updateProtocol(id, {
      title: parsed.data.title,
      description: parsed.data.description ?? undefined,
      category: parsed.data.category ?? undefined,
    });
    if (parsed.data.phases) await replaceProtocolPhases(id, parsed.data.phases);
  }

  await writeAuditLog({
    action: parsed.data.archive ? "protocol_archived" : "protocol_updated",
    adminId: admin.sub,
    entityType: "protocol",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { changedFields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ success: true });
}
