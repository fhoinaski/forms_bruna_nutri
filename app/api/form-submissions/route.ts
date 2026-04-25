import { NextRequest, NextResponse } from "next/server";
import { LegacyFormSchema } from "@/lib/validators/submission";
import { createSubmission } from "@/lib/repositories/submissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = LegacyFormSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Dados inválidos." },
        { status: 400 }
      );
    }

    const data = result.data;
    const { nome, email, whatsapp, ...rest } = data;

    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== null && value !== "") {
        answers[key] = String(value);
      }
    }

    const id = await createSubmission({
      patient_name: nome,
      patient_email: email || null,
      patient_phone: whatsapp || null,
      form_type: "pre_consulta",
      answers,
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error("[form-submissions] POST error:", error);
    return NextResponse.json(
      { success: false, message: "Não foi possível enviar o formulário." },
      { status: 500 }
    );
  }
}
