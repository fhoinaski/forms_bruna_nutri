import { createHmac, randomUUID } from "node:crypto";

// Cookie first-party, httpOnly (o valor cru nunca e lido por JS no browser
// nem armazenado no banco — so o HMAC dele vai para analytics_sessions).
export const ANALYTICS_COOKIE_NAME = "bruna_nutri_analytics_sid";

// Regra de sessao documentada: 30 minutos sem atividade = nova sessao. O
// cookie e reemitido (sliding window) a cada evento, entao a ausencia do
// cookie ja implica timeout na maioria dos casos; o backend tambem valida
// last_seen_at de forma defensiva contra clock skew/retries tardios.
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_TIMEOUT_MS / 1000;

function pepper(): string {
  return process.env.AUTH_SECRET ?? "local-development";
}

export function createRawSessionToken(): string {
  return randomUUID();
}

// HMAC-SHA256 do token cru — o valor gravado em analytics_sessions.session_hash.
// Nunca reversivel para o cookie original.
export function hashSessionToken(rawToken: string): string {
  return createHmac("sha256", pepper()).update(rawToken).digest("hex");
}

export function isSessionExpired(lastSeenAtIso: string, now: Date = new Date()): boolean {
  const lastSeen = new Date(lastSeenAtIso).getTime();
  if (Number.isNaN(lastSeen)) return true;
  return now.getTime() - lastSeen > SESSION_TIMEOUT_MS;
}
