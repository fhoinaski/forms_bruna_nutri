import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { createPayment, getPayments } from "@/lib/repositories/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.enum(["pendente", "pago", "vencido", "cancelado"]);
const methodSchema = z.enum(["pix", "cartao", "dinheiro", "transferencia", "outro"]);

const FiltersSchema = z.object({
  status: statusSchema.optional(),
  clientId: z.string().max(100).optional(),
  from: z.string().max(20).optional(),
  to: z.string().max(20).optional(),
});

const CreateSchema = z.object({
  client_id: z.string().max(100).nullable().optional(),
  description: z.string().trim().min(1).max(180),
  amount_cents: z.number().int().min(0).max(10_000_000),
  due_date: z.string().max(20).nullable().optional(),
  paid_at: z.string().datetime().nullable().optional(),
  status: statusSchema.default("pendente"),
  payment_method: methodSchema.nullable().optional(),
  invoice_number: z.string().trim().max(80).nullable().optional(),
  payment_link: z.string().trim().url().nullable().optional(),
  receipt_url: z.string().trim().url().nullable().optional(),
  installment_number: z.number().int().min(1).max(120).nullable().optional(),
  installment_total: z.number().int().min(1).max(120).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const parsed = FiltersSchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    clientId: searchParams.get("clientId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ message: "Filtros invalidos." }, { status: 400 });
  }

  const items = await getPayments(parsed.data);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });
  }

  const id = await createPayment(parsed.data);
  return NextResponse.json({ id }, { status: 201 });
}
