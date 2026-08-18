import type { DeviceType, SourceCategory } from "@/lib/analytics/types";

// Classificacao de origem — inteiramente deterministica (nunca por IA).
// Regra: UTM primeiro, depois referrer. "direct" so quando nao ha UTM
// suficiente E nao ha referrer utilizavel.

const SEARCH_ENGINE_DOMAINS = [
  "google.",
  "bing.com",
  "search.yahoo.",
  "duckduckgo.com",
  "baidu.com",
  "yandex.",
  "ecosia.org",
];

const SOCIAL_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "l.facebook.com",
  "lm.facebook.com",
  "m.facebook.com",
  "t.co",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "pinterest.com",
  "threads.net",
];

const WHATSAPP_DOMAINS = ["wa.me", "whatsapp.com", "api.whatsapp.com"];

const SOCIAL_UTM_SOURCE_TOKENS = ["instagram", "facebook", "tiktok", "linkedin", "pinterest", "threads", "twitter", "x"];
const PAID_UTM_MEDIUM_TOKENS = ["cpc", "ppc", "paid", "ads", "adwords", "display"];
const EMAIL_UTM_MEDIUM_TOKENS = ["email", "e-mail", "newsletter"];

export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function domainMatches(domain: string, list: string[]): boolean {
  return list.some((entry) => domain === entry.replace(/\.$/, "") || domain.endsWith(entry) || domain.includes(entry));
}

export interface SourceClassificationInput {
  utmSource?: string | null;
  utmMedium?: string | null;
  referrerDomain?: string | null;
}

export function classifySource({ utmSource, utmMedium, referrerDomain }: SourceClassificationInput): SourceCategory {
  const source = utmSource?.trim().toLowerCase() || null;
  const medium = utmMedium?.trim().toLowerCase() || null;

  if (source || medium) {
    if (source === "whatsapp" || medium === "whatsapp") return "whatsapp";
    if (medium && PAID_UTM_MEDIUM_TOKENS.includes(medium)) return "paid";
    if (medium && EMAIL_UTM_MEDIUM_TOKENS.includes(medium)) return "email";
    if (medium === "social" || (source && SOCIAL_UTM_SOURCE_TOKENS.includes(source))) return "social";
    if (medium === "organic" || medium === "search" || medium === "seo") return "organic_search";
    if (medium === "referral") return "referral";
    return "other";
  }

  const domain = referrerDomain?.toLowerCase() ?? null;
  if (!domain) return "direct";
  if (domainMatches(domain, WHATSAPP_DOMAINS)) return "whatsapp";
  if (domainMatches(domain, SEARCH_ENGINE_DOMAINS)) return "organic_search";
  if (domainMatches(domain, SOCIAL_DOMAINS)) return "social";
  return "referral";
}

// Deteccao de dispositivo/navegador/SO — aproximada via User-Agent, sem
// fingerprint (nenhuma lista de fontes, canvas, webgl, etc.).

export function detectDeviceType(userAgent: string | null | undefined): DeviceType {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet(?!.*mobile)|kindle|playbook/.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(ua)) return "mobile";
  if (/android/.test(ua)) return "tablet";
  if (ua.length === 0) return "unknown";
  return "desktop";
}

export function detectBrowserFamily(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) return "Chrome";
  if (/crios\//i.test(ua)) return "Chrome";
  if (/fxios\//i.test(ua)) return "Firefox";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/safari\//i.test(ua) && /version\//i.test(ua)) return "Safari";
  if (/msie |trident\//i.test(ua)) return "Internet Explorer";
  return "Other";
}

export function detectOsFamily(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  if (/windows/i.test(ua)) return "Windows";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  if (/android/i.test(ua)) return "Android";
  if (/linux/i.test(ua)) return "Linux";
  return "Other";
}

// Deteccao conservadora de bots — apenas padroes conhecidos e explicitos de
// crawlers/automacao. Ausencia de User-Agent tambem e tratada como suspeita
// (navegadores reais sempre enviam um). Nunca tenta "adivinhar" por
// heuristicas invasivas de comportamento.
const BOT_UA_PATTERNS = [
  /bot\b/i,
  /crawl/i,
  /spider/i,
  /slurp/i,
  /googlebot/i,
  /bingbot/i,
  /yandexbot/i,
  /duckduckbot/i,
  /baiduspider/i,
  /ahrefsbot/i,
  /semrushbot/i,
  /mj12bot/i,
  /petalbot/i,
  /applebot/i,
  /facebookexternalhit/i,
  /discordbot/i,
  /telegrambot/i,
  /whatsapp\/\d/i, // link-preview fetcher do WhatsApp (nao o app real)
  /headlesschrome/i,
  /phantomjs/i,
  /lighthouse/i,
  /python-requests/i,
  /python-urllib/i,
  /curl\//i,
  /wget\//i,
  /node-fetch/i,
  /^axios\//i,
  /go-http-client/i,
  /scrapy/i,
];

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length < 5) return true;
  return BOT_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}
