import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getClientPortalSessionFromRequest } from "@/lib/auth/client-portal-session";
import { getClientTaskById, updateClientTaskStatus } from "@/lib/repositories/client-tasks";
import { addTimelineEvent } from "@/lib/repositories/client-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  status: z.enum(["pendente", "concluida"]),
}).strict();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getClientPortalSessionFromRequest(req);
  if (!session) return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });

  const { taskId } = await params;
  const task = await getClientTaskById(taskId);
  if (!task || task.client_id !== session.sub) {
    return NextResponse.json({ message: "Tarefa nao encontrada." }, { status: 404 });
  }

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dados invalidos." }, { status: 400 });

  await updateClientTaskStatus(taskId, parsed.data.status);
  if (parsed.data.status === "concluida") {
    await addTimelineEvent({
      client_id: session.sub,
      type: "task_completed",
      title: "Tarefa concluida pelo portal",
      description: task.title,
      metadata: { taskId, source: "client_portal" },
    });
  }

  return NextResponse.json({ success: true });
}
