import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAdminFromRequest } from "@/lib/auth/session";
import { d1Execute, d1Query } from "@/lib/d1/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    mustChangePassword: z.boolean(),
  })
  .strict();

/**
 * Endpoint exclusivo de teste E2E (404 fora de E2E_TEST_MODE=1, só setado por
 * e2e/helpers/webserver-entrypoint.mjs) que CRIA (ou devolve ao estado semeado)
 * uma conta de admin com senha + must_change_password conhecidos e MFA
 * desligado.
 *
 * Existe pelo MESMO motivo dos admins mutáveis isolados por projeto (ver
 * comentário em e2e/helpers/webserver-entrypoint.mjs): os testes de
 * "troca obrigatória de senha" e "MFA" mutam a conta PARA VALER e, sob
 * `--repeat-each`/paralelismo dentro da MESMA instância de servidor, as
 * repetições concorreriam sobre a mesma conta. Cada teste usa um email ÚNICO
 * (por repeat/worker) e este endpoint faz o UPSERT, eliminando a corrida.
 * Não há backdoor fora do ambiente de teste: a rota só responde sob
 * E2E_TEST_MODE=1 e exige sessão admin válida, como o test-seed/route.ts.
 */
export async function POST(req: NextRequest) {
  if (process.env.E2E_TEST_MODE !== "1") {
    return NextResponse.json({ message: "Não encontrado." }, { status: 404 });
  }

  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const now = new Date().toISOString();

  const existing = (
    await d1Query<{ id: string }>("SELECT id FROM admin_users WHERE email = ?1 LIMIT 1", [parsed.data.email])
  )[0];
  const id = existing?.id ?? `e2e-${randomUUID()}`;

  await d1Execute(
    `INSERT INTO admin_users (id, name, email, password_hash, must_change_password, mfa_enabled, mfa_secret_encrypted, mfa_pending_secret_encrypted, recovery_codes_json, session_version, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 0, NULL, NULL, NULL, 1, ?6, ?6)
     ON CONFLICT(email) DO UPDATE SET
       password_hash = excluded.password_hash,
       must_change_password = excluded.must_change_password,
       mfa_enabled = 0,
       mfa_secret_encrypted = NULL,
       mfa_pending_secret_encrypted = NULL,
       recovery_codes_json = NULL,
       updated_at = excluded.updated_at`,
    [id, parsed.data.email, parsed.data.email, passwordHash, parsed.data.mustChangePassword ? 1 : 0, now]
  );

  return NextResponse.json({ success: true });
}
