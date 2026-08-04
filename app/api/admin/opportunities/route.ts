import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  backfillLeadOpportunities,
  listLeadOpportunities,
} from "@/lib/repositories/lead-opportunities";
import { writeAuditLog } from "@/lib/security/audit";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stageSchema = z.enum(["novo", "acolhimento", "aguardando_resposta", "agendado", "convertido", "perdido"]);
const temperatureSchema = z.enum(["frio", "morno", "quente"]);

const filtersSchema = z.object({
  stage: stageSchema.optional(),
  temperature: temperatureSchema.optional(),
  search: z.string().trim().max(120).optional(),
});

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const parsed = filtersSchema.safeParse({
    stage: req.nextUrl.searchParams.get("stage") ?? undefined,
    temperature: req.nextUrl.searchParams.get("temperature") ?? undefined,
    search: req.nextUrl.searchParams.get("search") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ message: "Filtros invalidos." }, { status: 400 });

  const items = await listLeadOpportunities(parsed.data);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const created = await backfillLeadOpportunities(500);
  await writeAuditLog({
    action: "lead_opportunities_backfilled",
    adminId: admin.sub,
    entityType: "lead_opportunities",
    ipHash: getRequestFingerprint(req).ipHash,
    metadata: { created },
  });
  return NextResponse.json({ created }, { status: 201 });
}
