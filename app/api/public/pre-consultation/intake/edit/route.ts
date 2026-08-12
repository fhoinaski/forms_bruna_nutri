import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readIntakeSessionToken, verifyIntakeSessionToken } from "@/lib/security/intake-session-token";
import {
  editIntakeField,
  IntakeNotFoundError,
  IntakeConcurrencyError,
} from "@/lib/ai/agents/patient/intake/intake-service";
import { getIntakeField, toFieldView } from "@/lib/clinical/pre-consultation-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EditSchema = z.object({
  field: z.string().min(1).max(80),
  sessionVersion: z.number().int().positive(),
}).strict();

export async function POST(req: NextRequest) {
  const token = readIntakeSessionToken(req);
  const sessionId = token ? await verifyIntakeSessionToken(token) : null;
  if (!sessionId) {
    return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Payload inválido." }, { status: 400 });
  }
  const parsed = EditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const field = getIntakeField(parsed.data.field);
  if (!field) {
    return NextResponse.json({ message: "Campo inválido." }, { status: 400 });
  }

  try {
    const next = await editIntakeField(sessionId, parsed.data.sessionVersion, parsed.data.field);
    return NextResponse.json({
      field: toFieldView(field, next.answers),
      status: next.status,
      progress: next.progress,
      sessionVersion: parsed.data.sessionVersion + 1,
    });
  } catch (error) {
    if (error instanceof IntakeNotFoundError) {
      return NextResponse.json({ message: "Sessão não encontrada." }, { status: 404 });
    }
    if (error instanceof IntakeConcurrencyError) {
      return NextResponse.json({ message: "Sessão alterada em paralelo. Recarregue e tente novamente." }, { status: 409 });
    }
    return NextResponse.json({ message: "Não foi possível editar o campo." }, { status: 500 });
  }
}