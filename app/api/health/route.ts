import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requiredEnvironment = [
  "AUTH_SECRET",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_D1_DATABASE_ID",
  "CLOUDFLARE_D1_API_TOKEN",
];

export async function GET() {
  const missing = requiredEnvironment.filter((key) => !process.env[key]);
  const status = missing.length ? 503 : 200;

  return NextResponse.json(
    {
      ok: missing.length === 0,
      service: "bruna-flores-nutri",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      checked_at: new Date().toISOString(),
      checks: {
        environment: {
          ok: missing.length === 0,
          missing,
        },
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
