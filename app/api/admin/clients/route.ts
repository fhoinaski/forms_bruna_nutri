import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClients, getClientMetrics } from "@/lib/repositories/clients";
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
