import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAdminFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnóstico test-only (Clinical Copilot R1.2.6, seção 3): expõe o
 * git SHA/BUILD_ID/timestamp gravados por `scripts/write-build-info.mjs`
 * no `postbuild`, pra o E2E provar que o `next start` que ele está testando
 * foi construído a partir do changeset atual — nunca disponível fora de
 * E2E_TEST_MODE=1 (404, mesmo padrão dos demais endpoints em app/api/admin/e2e).
 */
export async function GET(req: NextRequest) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ message: "Não encontrado." }, { status: 404 });
  }
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const infoPath = join(process.cwd(), ".next", "e2e-build-info.json");
  if (!existsSync(infoPath)) {
    return NextResponse.json({ buildId: null, gitSha: null, builtAt: null }, { status: 200 });
  }
  const info = JSON.parse(readFileSync(infoPath, "utf8"));
  return NextResponse.json(info);
}
