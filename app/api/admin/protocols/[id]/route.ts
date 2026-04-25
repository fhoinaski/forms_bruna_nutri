import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getProtocolById, updateProtocol, archiveProtocol } from "@/lib/repositories/protocols";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  archive: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const protocol = await getProtocolById(id);
  if (!protocol) return NextResponse.json({ message: "Protocolo não encontrado." }, { status: 404 });

  return NextResponse.json(protocol);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const protocol = await getProtocolById(id);
  if (!protocol) return NextResponse.json({ message: "Protocolo não encontrado." }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  if (parsed.data.archive) {
    await archiveProtocol(id);
  } else {
    await updateProtocol(id, {
      title: parsed.data.title,
      description: parsed.data.description ?? undefined,
      category: parsed.data.category ?? undefined,
    });
  }

  return NextResponse.json({ success: true });
}
