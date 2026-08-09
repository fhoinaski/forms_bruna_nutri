import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { createClient, getClients, getClientMetrics } from "@/lib/repositories/clients";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { getRequestFingerprint } from "@/lib/security/request";
import { writeAuditLog } from "@/lib/security/audit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
  status: z.enum(["ativo", "inativo", "arquivado"]).optional(),
  submissionId: z.string().max(100).optional(),
});

const CreateSchema = z.object({
  name: z.string().trim().min(2, "Nome e obrigatorio.").max(200),
  email: z.string().trim().email("E-mail invalido.").max(200).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(30).optional().nullable(),
  birth_date: z.string().trim().max(20).optional().nullable().or(z.literal("")),
  notes: z.string().trim().max(10000).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Não autorizado." }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const parsed = FiltersSchema.safeParse({
    page: searchParams.get("page") ?? 1,
    pageSize: searchParams.get("pageSize") ?? 20,
    search: searchParams.get("search") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    submissionId: searchParams.get("submissionId") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ message: "Filtros inválidos." }, { status: 400 });
  }

  const [result, metrics] = await Promise.all([
    getClients(parsed.data),
    getClientMetrics(),
  ]);

  return NextResponse.json({ ...result, metrics });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados invalidos." }, { status: 400 });
  }

  const clientId = await createClient({
    name: parsed.data.name,
    email: parsed.data.email || null,
    phone: parsed.data.phone || null,
    birth_date: parsed.data.birth_date || null,
    source_submission_id: null,
    notes: parsed.data.notes || "Paciente cadastrado manualmente no dashboard.",
  });

  await addTimelineEvent({
    client_id: clientId,
    type: "client_created",
    title: "Paciente cadastrado manualmente",
    description: "Cadastro criado pela equipe no dashboard, sem vinculo com pre-consulta publica.",
    metadata: { source: "manual_dashboard" },
  });

  await writeAuditLog({
    action: "client_created_manually",
    adminId: admin.sub,
    entityType: "client",
    entityId: clientId,
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { source: "dashboard" },
  });

  return NextResponse.json({ id: clientId }, { status: 201 });
}
