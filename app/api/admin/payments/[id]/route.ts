import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { deletePayment, updatePayment } from "@/lib/repositories/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.enum(["pendente", "pago", "vencido", "cancelado"]);
const methodSchema = z.enum(["pix", "cartao", "dinheiro", "transferencia", "outro"]);

const UpdateSchema = z
  .object({
    client_id: z.string().max(100).nullable().optional(),
    description: z.string().trim().min(1).max(180).optional(),
    amount_cents: z.number().int().min(0).max(10_000_000).optional(),
    due_date: z.string().max(20).nullable().optional(),
    paid_at: z.string().datetime().nullable().optional(),
    status: statusSchema.optional(),
    payment_method: methodSchema.nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await params;
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });
  }

  await updatePayment(id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { id } = await params;
  await deletePayment(id);
  return NextResponse.json({ ok: true });
}
