import type { NextRequest } from "next/server";
import { d1Execute, d1Query } from "@/lib/d1/client";
import { ensureSecuritySchema } from "@/lib/security/schema";
import { getRequestFingerprint } from "@/lib/security/request";

type RateLimitRow = {
  window_started_at: string;
  attempts: number;
  blocked_until: string | null;
};

export async function consumeRateLimit(
  req: NextRequest,
  options: { scope: string; limit: number; windowMs: number; blockMs?: number }
) {
  await ensureSecuritySchema();
  const { ipHash } = getRequestFingerprint(req);
  const key = `${options.scope}:${ipHash}`;
  const now = Date.now();
  const row = (await d1Query<RateLimitRow>(
    "SELECT window_started_at, attempts, blocked_until FROM security_rate_limits WHERE rate_key = ?1",
    [key]
  ))[0];

  if (row?.blocked_until && Date.parse(row.blocked_until) > now) {
    return { allowed: false, retryAfter: Math.ceil((Date.parse(row.blocked_until) - now) / 1000), ipHash };
  }

  const expired = !row || now - Date.parse(row.window_started_at) >= options.windowMs;
  const attempts = expired ? 1 : row.attempts + 1;
  const blocked = attempts > options.limit;
  const blockedUntil = blocked
    ? new Date(now + (options.blockMs ?? options.windowMs)).toISOString()
    : null;
  const windowStartedAt = expired ? new Date(now).toISOString() : row.window_started_at;

  await d1Execute(
    `INSERT INTO security_rate_limits (rate_key, window_started_at, attempts, blocked_until, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(rate_key) DO UPDATE SET window_started_at = excluded.window_started_at,
       attempts = excluded.attempts, blocked_until = excluded.blocked_until, updated_at = excluded.updated_at`,
    [key, windowStartedAt, attempts, blockedUntil, new Date(now).toISOString()]
  );

  return {
    allowed: !blocked,
    retryAfter: blocked ? Math.ceil((Date.parse(blockedUntil!) - now) / 1000) : 0,
    ipHash,
  };
}

export async function clearRateLimit(scope: string, ipHash: string) {
  await d1Execute("DELETE FROM security_rate_limits WHERE rate_key = ?1", [`${scope}:${ipHash}`]);
}
