import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getProtocols, createProtocol } from "@/lib/repositories/protocols";
import { z } from "zod";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const phaseSchema = z.object({
  title: z.string().min(1).max(500),
  days: z.string().max(50).optional().nullable(),
  objective: z.string().max(2000).optional().nullable(),
  actions: z.array(z.string().min(1)).default([]),
  notes: z.string().max(2000).optional().nullable(),
});

const createSchema = z.object({
  title: z.string().min(1, "Título é obrigatório").max(500),
  description: z.string().max(10000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  phases: z.array(phaseSchema).default([]),
  kind: z.enum(["standard", "personalized"]).default("standard"),
  clientId: z.string().uuid().optional().nullable(),
}).strict();

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
  const search = url.searchParams.get("search") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const activeParam = url.searchParams.get("isActive");
  const isActive = activeParam === null ? undefined : activeParam !== "false";
  const kindParam = url.searchParams.get("kind");
  const kind = kindParam === "personalized" ? "personalized" : kindParam === "standard" ? "standard" : undefined;
  const clientId = url.searchParams.get("clientId") ?? undefined;

  const result = await getProtocols({ page, pageSize, search, category, isActive, kind, clientId });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const id = await createProtocol({
    title: parsed.data.title,
    description: parsed.data.description,
    category: parsed.data.category,
    created_by: admin.sub,
    kind: parsed.data.kind,
    client_id: parsed.data.clientId,
    phases: parsed.data.phases,
  });
  await writeAuditLog({
    action: "protocol_created",
    adminId: admin.sub,
    entityType: "protocol",
    entityId: id,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { kind: parsed.data.kind, clientId: parsed.data.clientId ?? null },
  });
  return NextResponse.json({ id }, { status: 201 });
}
