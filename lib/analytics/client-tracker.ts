"use client";

import type { AnalyticsEventType } from "@/lib/analytics/types";

const ENDPOINT = "/api/public/analytics/events";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

function readUtmParams(): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value.slice(0, 150);
  }
  return out;
}

function sendPayload(events: Record<string, unknown>[]) {
  if (typeof window === "undefined" || events.length === 0) return;
  try {
    const body = JSON.stringify({ events });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const accepted = navigator.sendBeacon(ENDPOINT, blob);
      if (accepted) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      /* analytics nunca pode quebrar a navegacao — falha silenciosa */
    });
  } catch {
    /* idem: nunca lancar para o chamador */
  }
}

export interface TrackEventOptions {
  path?: string;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Dispara um evento de analytics. Sempre assincrono/best-effort — nunca
 * lanca excecao, nunca bloqueia a navegacao. Um client_event_id novo por
 * chamada permite ao backend deduplicar retries automaticamente.
 */
export function trackEvent(eventType: AnalyticsEventType, options: TrackEventOptions = {}): void {
  if (typeof window === "undefined") return;
  try {
    const path = options.path ?? window.location.pathname;
    sendPayload([
      {
        event_type: eventType,
        client_event_id: crypto.randomUUID(),
        path,
        page_title: typeof document !== "undefined" ? document.title?.slice(0, 200) : undefined,
        referrer: typeof document !== "undefined" && document.referrer ? document.referrer.slice(0, 500) : undefined,
        ...readUtmParams(),
        metadata: options.metadata,
      },
    ]);
  } catch {
    /* nunca propagar */
  }
}

export function trackPageView(path?: string): void {
  trackEvent("PAGE_VIEW", { path });
}
