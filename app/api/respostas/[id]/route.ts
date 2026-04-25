import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { formResponses } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const response = await db.select().from(formResponses).where(eq(formResponses.id, id)).get();
    
    if (!response) {
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }
    
    return NextResponse.json({ data: response });
  } catch (error) {
    console.error("Erro ao buscar:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
