import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

function hash(value: string) {
  const pepper = process.env.AUTH_SECRET ?? "local-development";
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

export function getRequestFingerprint(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = req.headers.get("cf-connecting-ip") ?? forwarded ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  return {
    ipHash: hash(ip),
    userAgentHash: hash(userAgent),
  };
}
