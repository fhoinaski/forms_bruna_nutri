import { NextRequest, NextResponse } from "next/server";
import { prepareUpcomingConsultationBriefs } from "@/lib/clinical/appointment-briefing";
import { verifyCronSecret } from "@/lib/security/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  const result = await prepareUpcomingConsultationBriefs();
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
