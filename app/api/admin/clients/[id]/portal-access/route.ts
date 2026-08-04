import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";
import { getClientById } from "@/lib/repositories/clients";
import {
  createOrRotateClientPortalCode,
  getClientPortalAccess,
  setClientPortalAccessActive,
} from "@/lib/repositories/client-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  active: z.boolean(),
}).strict();

function portalLoginUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://brunanutri.com.br";
  return `${baseUrl.replace(/\/$/, "")}/portal`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const access = await getClientPortalAccess(id);
  return NextResponse.json({
    exists: Boolean(access),
    is_active: access?.is_active === 1,
    last_used_at: access?.last_used_at ?? null,
    updated_at: access?.updated_at ?? null,
    login_url: portalLoginUrl(),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });
  if (!client.email) {
    return NextResponse.json({ message: "Cadastre um e-mail no cliente antes de liberar o portal." }, { status: 400 });
  }

  const result = await createOrRotateClientPortalCode(id);
  await writeAuditLog({
    action: "client_portal_code_rotated",
    adminId: admin.sub,
    entityType: "client",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
  });
  return NextResponse.json({ code: result.code, login_url: portalLoginUrl() });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) return NextResponse.json({ message: "Cliente nao encontrado." }, { status: 404 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  await setClientPortalAccessActive(id, parsed.data.active);
  await writeAuditLog({
    action: parsed.data.active ? "client_portal_enabled" : "client_portal_disabled",
    adminId: admin.sub,
    entityType: "client",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
  });
  return NextResponse.json({ success: true });
}
