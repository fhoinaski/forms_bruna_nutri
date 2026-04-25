import { NextResponse } from "next/server";
import { db } from "@/db";
import { formResponses } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const responses = await db.select().from(formResponses).orderBy(desc(formResponses.createdAt));
    
    if (!responses.length) {
       return new NextResponse("Nenhuma resposta encontrada", { status: 404 });
    }

    const headers = Object.keys(responses[0]).join(",");
    const rows = responses.map(row => {
      return Object.values(row).map(value => {
        // Escape quotes and handle commas
        if (value === null || value === undefined) return '""';
        const stringValue = String(value).replace(/"/g, '""');
        return `"${stringValue}"`;
      }).join(",");
    });

    const csvContent = [headers, ...rows].join("\\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="respostas-pre-consulta.csv"`,
      },
    });
  } catch (error) {
    console.error("Erro ao exportar:", error);
    return new NextResponse("Erro interno", { status: 500 });
  }
}
