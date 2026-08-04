import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import {
  createClientTask,
  getAllClientTasks,
} from "@/lib/repositories/client-tasks";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusSchema = z.enum(["pendente", "concluida", "cancelada"]);

const FiltersSchema = z.object({
  status: statusSchema.optional(),
  search: z.string().max(160).optional(),
});

const CreateSchema = z.object({
  client_id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).nullable().optional(),
  due_date: z.string().max(20).nullable().optional(),
  status: statusSchema.default("pendente"),
});

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const parsed = FiltersSchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    search: searchParams.get("search") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ message: "Filtros invalidos." }, { status: 400 });
  }

  const items = await getAllClientTasks(parsed.data);
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

  const id = await createClientTask(parsed.data);
  await addTimelineEvent({
    client_id: parsed.data.client_id,
    type: "task_created",
    title: "Tarefa adicionada",
    description: parsed.data.title,
    metadata: { taskId: id },
  });

  return NextResponse.json({ id }, { status: 201 });
}
