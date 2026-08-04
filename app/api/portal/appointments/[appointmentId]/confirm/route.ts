import { NextRequest, NextResponse } from "next/server";
import { getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
import { d1Execute, d1Query } from "@/lib/d1/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const session = await getClientPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { appointmentId } = await params;
  const rows = await d1Query<{ id: string; client_id: string | null; status: string }>(
    "SELECT id, client_id, status FROM appointments WHERE id = ?1 LIMIT 1",
    [appointmentId]
  );
  const appointment = rows[0];
  if (!appointment || appointment.client_id !== session.sub) {
    return NextResponse.json({ message: "Consulta nao encontrada." }, { status: 404 });
  }
  if (appointment.status === "cancelado") {
    return NextResponse.json({ message: "Consulta cancelada nao pode ser confirmada." }, { status: 400 });
  }

  await d1Execute(
    "UPDATE appointments SET status = 'confirmado', client_confirmed_at = ?1, updated_at = ?1 WHERE id = ?2",
    [new Date().toISOString(), appointmentId]
  );

  return NextResponse.json({ ok: true });
}
