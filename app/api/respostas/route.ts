import { NextRequest, NextResponse } from "next/server";
import { FormResponseSchema } from "@/validators/form";
import { db } from "@/db";
import { formResponses } from "@/db/schema";
import { desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = FormResponseSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json({ error: "Dados inválidos", details: result.error.format() }, { status: 400 });
    }

    const data = result.data;
    
    // Insert into database
    await db.insert(formResponses).values({
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      ...data
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao salvar:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const responses = await db.select().from(formResponses).orderBy(desc(formResponses.createdAt));
    return NextResponse.json({ data: responses });
  } catch (error) {
    console.error("Erro ao buscar:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
