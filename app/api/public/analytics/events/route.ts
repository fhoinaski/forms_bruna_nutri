import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { analyticsIngestPayloadSchema, sanitizeMetadata } from "@/lib/analytics/validation";
import {
  classifySource,
  detectBrowserFamily,
  detectDeviceType,
  detectOsFamily,
  extractDomain,
  isBotUserAgent,
} from "@/lib/analytics/classify";
import { ANALYTICS_COOKIE_NAME, SESSION_COOKIE_MAX_AGE_SECONDS, createRawSessionToken } from "@/lib/analytics/session";
import { isInternalRequest } from "@/lib/analytics/internal-traffic";
import { insertAnalyticsEvents, resolveOrCreateSession } from "@/lib/repositories/analytics";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCountryCode(req: NextRequest): string | null {
  return req.headers.get("x-vercel-ip-country") ?? req.headers.get("cf-ipcountry") ?? null;
}

export async function POST(req: NextRequest) {
  // Analytics nunca pode bloquear a experiencia publica: rate limit e
  // validacao de payload sao as unicas respostas de erro reais; qualquer
  // falha depois disso (D1 fora do ar, etc.) e engolida e respondemos 202
  // do mesmo jeito, porque o tracker no browser tambem falha em silencio.
  try {
    const limit = await consumeRateLimit(req, {
      scope: "public-analytics",
      limit: 120,
      windowMs: 5 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const parsed = analyticsIngestPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false }, { status: 400 });
    }
    if (parsed.data.companyWebsite) {
      // honeypot preenchido — resposta falsa de sucesso, nada e gravado.
      return NextResponse.json({ success: true }, { status: 202 });
    }

    const userAgent = req.headers.get("user-agent");
    const isBot = isBotUserAgent(userAgent);
    const isInternal = isInternalRequest(req);
    const deviceType = detectDeviceType(userAgent);
    const browserFamily = detectBrowserFamily(userAgent);
    const osFamily = detectOsFamily(userAgent);
    const countryCode = getCountryCode(req);

    const existingRawToken = req.cookies.get(ANALYTICS_COOKIE_NAME)?.value;
    const rawToken = existingRawToken || createRawSessionToken();

    const firstEvent = parsed.data.events[0];
    const referrerDomain = extractDomain(firstEvent.referrer ?? null);
    const sourceCategory = classifySource({
      utmSource: firstEvent.utm_source ?? null,
      utmMedium: firstEvent.utm_medium ?? null,
      referrerDomain,
    });

    const { session, rawTokenToPersist } = await resolveOrCreateSession(
      rawToken,
      {
        landingPath: firstEvent.path,
        landingReferrer: firstEvent.referrer ?? null,
        referrerDomain,
        sourceCategory,
        utmSource: firstEvent.utm_source ?? null,
        utmMedium: firstEvent.utm_medium ?? null,
        utmCampaign: firstEvent.utm_campaign ?? null,
        utmTerm: firstEvent.utm_term ?? null,
        utmContent: firstEvent.utm_content ?? null,
        countryCode,
        deviceType,
        browserFamily,
        osFamily,
        isBot,
        isInternal,
      }
    );

    await insertAnalyticsEvents(
      session.id,
      parsed.data.events.map((event) => ({
        clientEventId: event.client_event_id,
        eventType: event.event_type,
        path: event.path,
        pageTitle: event.page_title ?? null,
        referrer: event.referrer ?? null,
        utmSource: event.utm_source ?? null,
        utmMedium: event.utm_medium ?? null,
        utmCampaign: event.utm_campaign ?? null,
        utmTerm: event.utm_term ?? null,
        utmContent: event.utm_content ?? null,
        metadataJson: (() => {
          const sanitized = sanitizeMetadata(event.event_type, event.metadata);
          return sanitized ? JSON.stringify(sanitized) : null;
        })(),
        isBot,
        isInternal,
      }))
    );

    const response = NextResponse.json({ success: true }, { status: 202 });
    response.cookies.set(ANALYTICS_COOKIE_NAME, rawTokenToPersist, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    logger.error("analytics_ingest_failed", { error });
    // Fail-open: mesmo com falha interna, o tracker no browser nao deve
    // ver um erro que o leve a tentar de novo agressivamente ou logar ruido.
    return NextResponse.json({ success: true }, { status: 202 });
  }
}
