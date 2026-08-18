import type { NextRequest } from "next/server";
import { d1Query } from "@/lib/d1/client";
import { hashSessionToken } from "@/lib/analytics/session";
import { insertAnalyticsEvents } from "@/lib/repositories/analytics";
import { isInternalRequest } from "@/lib/analytics/internal-traffic";
import { isBotUserAgent } from "@/lib/analytics/classify";
import type { AnalyticsEventType, AnalyticsSessionRow } from "@/lib/analytics/types";
import { logger } from "@/lib/observability/logger";

const ANALYTICS_COOKIE_NAME = "bruna_nutri_analytics_sid";

/**
 * Registra um evento de conversao (ex.: PRECONSULTATION_COMPLETED) a partir
 * de uma rota de API que NAO e o endpoint de ingestao publico — usado
 * exclusivamente depois que o backend confirmou sucesso real (nunca so
 * porque o usuario clicou em um botao). So anexa o evento a sessao de
 * analytics que ja existe (nao cria uma nova aqui); se nao houver cookie de
 * analytics (ex.: chamada direta de API sem navegacao previa), o evento e
 * descartado silenciosamente — analytics nunca pode interferir no fluxo
 * clinico real.
 */
export async function recordServerSideConversion(
  req: NextRequest,
  eventType: AnalyticsEventType,
  path: string,
  metadata?: Record<string, string | number | boolean>
): Promise<void> {
  try {
    const rawToken = req.cookies.get(ANALYTICS_COOKIE_NAME)?.value;
    if (!rawToken) return;

    const hash = hashSessionToken(rawToken);
    const rows = await d1Query<AnalyticsSessionRow>(
      "SELECT * FROM analytics_sessions WHERE session_hash = ?1 LIMIT 1",
      [hash]
    );
    const session = rows[0];
    if (!session) return;

    const userAgent = req.headers.get("user-agent");
    await insertAnalyticsEvents(session.id, [
      {
        clientEventId: crypto.randomUUID(),
        eventType,
        path,
        pageTitle: null,
        referrer: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        utmTerm: null,
        utmContent: null,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
        isBot: isBotUserAgent(userAgent),
        isInternal: isInternalRequest(req),
      },
    ]);
  } catch (error) {
    logger.error("analytics_server_track_failed", { error, eventType });
  }
}
