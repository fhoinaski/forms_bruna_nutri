import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { getClientTaskById, updateClientTaskStatus } from "@/lib/repositories/client-tasks";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["pendente", "concluida", "cancelada"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { taskId } = await params;
  const task = await getClientTaskById(taskId);
  if (!task) return NextResponse.json({ message: "Tarefa não encontrada." }, { status: 404 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  await updateClientTaskStatus(taskId, parsed.data.status);

  if (parsed.data.status === "concluida") {
    await addTimelineEvent({
      client_id: task.client_id,
      type: "task_completed",
      title: "Tarefa concluída",
      description: task.title,
      metadata: { taskId },
    });
  }

  return NextResponse.json({ success: true });
}
