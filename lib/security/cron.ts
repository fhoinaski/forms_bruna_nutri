import { NextRequest } from "next/server";

export function verifyCronSecret(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authorization = req.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  const headerSecret = req.headers.get("x-cron-secret");

  return bearer === secret || headerSecret === secret;
}
