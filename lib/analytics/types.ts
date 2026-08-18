export const ANALYTICS_EVENT_TYPES = [
  "PAGE_VIEW",
  "CTA_CLICK",
  "WHATSAPP_CLICK",
  "PRECONSULTATION_OPENED",
  "PRECONSULTATION_STARTED",
  "PRECONSULTATION_COMPLETED",
  "BLOG_VIEW",
  "SERVICE_VIEW",
  "CONTACT_CLICK",
  "PORTAL_LOGIN_OPENED",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

// Eventos que contam como conversao real (nunca um simples pageview).
export const CONVERSION_EVENT_TYPES: readonly AnalyticsEventType[] = ["PRECONSULTATION_COMPLETED"];

export const SOURCE_CATEGORIES = [
  "direct",
  "organic_search",
  "social",
  "paid",
  "referral",
  "email",
  "whatsapp",
  "other",
] as const;

export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

export const DEVICE_TYPES = ["desktop", "mobile", "tablet", "unknown"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

// Chaves de metadata permitidas por tipo de evento — qualquer chave fora
// dessa lista e descartada no servidor, mesmo que o cliente envie. Nunca
// inclui nada clinico (nenhuma resposta de anamnese, nenhum texto livre do
// paciente).
export const ALLOWED_METADATA_KEYS: Record<AnalyticsEventType, readonly string[]> = {
  PAGE_VIEW: [],
  CTA_CLICK: ["cta_id", "cta_label"],
  WHATSAPP_CLICK: ["location"],
  PRECONSULTATION_OPENED: ["entry_point"],
  PRECONSULTATION_STARTED: ["entry_point"],
  PRECONSULTATION_COMPLETED: ["submission_source"],
  BLOG_VIEW: ["slug"],
  SERVICE_VIEW: ["service_slug"],
  CONTACT_CLICK: ["channel"],
  PORTAL_LOGIN_OPENED: [],
};

export interface AnalyticsSessionRow {
  id: string;
  session_hash: string;
  started_at: string;
  last_seen_at: string;
  landing_path: string;
  landing_referrer: string | null;
  referrer_domain: string | null;
  source_category: SourceCategory;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  country_code: string | null;
  device_type: DeviceType;
  browser_family: string | null;
  os_family: string | null;
  is_bot: number;
  is_internal: number;
  pageview_count: number;
  event_count: number;
  converted: number;
  created_at: string;
  updated_at: string;
}
