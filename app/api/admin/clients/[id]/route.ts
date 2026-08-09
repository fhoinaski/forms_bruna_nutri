import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { deleteClient, getClientById, updateClient } from "@/lib/repositories/clients";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  birth_date: z.string().max(20).optional().nullable(),
  status: z.enum(["ativo", "inativo", "arquivado"]).optional(),
  notes: z.string().max(10000).optional().nullable(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const client = await getClientById(id);

  if (!client) {
    return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });
  }

  return NextResponse.json(client);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getClientById(id);
  if (!existing) {
    return NextResponse.json({ message: "Cliente não encontrado." }, { status: 404 });
  }

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dados inválidos." }, { status: 400 });
  }

  await updateClient(id, parsed.data);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "NÃ£o autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteClient(id);
  if (!deleted) {
    return NextResponse.json({ message: "Cliente nÃ£o encontrado." }, { status: 404 });
  }

  await writeAuditLog({
    action: "client_deleted",
    adminId: admin.sub,
    entityType: "client",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: {
      hadEmail: Boolean(deleted.email),
      sourceSubmissionId: deleted.source_submission_id,
    },
  });

  return NextResponse.json({ success: true });
}
