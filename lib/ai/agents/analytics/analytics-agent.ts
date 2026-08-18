import { z } from "zod";
import {
  getAnalyticsOverview,
  getCampaigns,
  getConversionFunnel,
  getTopPages,
  getTrafficSources,
} from "@/lib/repositories/analytics";
import { ANALYTICS_PERIOD_PRESETS, resolveAnalyticsPeriod, type AnalyticsPeriodPreset } from "@/lib/analytics/period";

/**
 * Tools de leitura do modulo de analytics do site (admin only). Todos os
 * numeros vem das MESMAS queries deterministicas usadas pela tela
 * /dashboard/analytics — a IA nunca calcula visita/conversao/origem/funil,
 * so le e narra o que o SQL ja computou. Nenhuma tool aqui escreve nada.
 */

const periodInputSchema = z.object({
  period: z.enum(ANALYTICS_PERIOD_PRESETS).default("7d"),
});

function resolvePeriodFromInput(input: { period: AnalyticsPeriodPreset }) {
  return resolveAnalyticsPeriod(input.period);
}

// ── get_site_analytics_overview (READ) ──────────────────────────────────

export const GET_SITE_ANALYTICS_OVERVIEW_TOOL_NAME = "getSiteAnalyticsOverview";
export const getSiteAnalyticsOverviewInputSchema = periodInputSchema;

export async function executeGetSiteAnalyticsOverview(input: z.infer<typeof getSiteAnalyticsOverviewInputSchema>) {
  const range = resolvePeriodFromInput(input);
  const overview = await getAnalyticsOverview(range.from, range.to);
  return { period: input.period, ...overview };
}

// ── get_top_traffic_sources (READ) ──────────────────────────────────────

export const GET_TOP_TRAFFIC_SOURCES_TOOL_NAME = "getTopTrafficSources";
export const getTopTrafficSourcesInputSchema = periodInputSchema;

export async function executeGetTopTrafficSources(input: z.infer<typeof getTopTrafficSourcesInputSchema>) {
  const range = resolvePeriodFromInput(input);
  const sources = await getTrafficSources(range.from, range.to);
  return { period: input.period, sources };
}

// ── get_top_pages (READ) ─────────────────────────────────────────────────

export const GET_TOP_PAGES_TOOL_NAME = "getTopPages";
export const getTopPagesInputSchema = periodInputSchema;

export async function executeGetTopPages(input: z.infer<typeof getTopPagesInputSchema>) {
  const range = resolvePeriodFromInput(input);
  const pages = await getTopPages(range.from, range.to);
  return { period: input.period, pages: pages.slice(0, 10) };
}

// ── get_conversion_funnel (READ) ─────────────────────────────────────────

export const GET_CONVERSION_FUNNEL_TOOL_NAME = "getConversionFunnel";
export const getConversionFunnelInputSchema = periodInputSchema;

export async function executeGetConversionFunnel(input: z.infer<typeof getConversionFunnelInputSchema>) {
  const range = resolvePeriodFromInput(input);
  const funnel = await getConversionFunnel(range.from, range.to);
  return { period: input.period, funnel };
}

// ── get_campaign_performance (READ) ──────────────────────────────────────

export const GET_CAMPAIGN_PERFORMANCE_TOOL_NAME = "getCampaignPerformance";
export const getCampaignPerformanceInputSchema = periodInputSchema;

export async function executeGetCampaignPerformance(input: z.infer<typeof getCampaignPerformanceInputSchema>) {
  const range = resolvePeriodFromInput(input);
  const campaigns = await getCampaigns(range.from, range.to);
  return { period: input.period, campaigns: campaigns.slice(0, 10) };
}

export const ANALYTICS_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode consultar os dados REAIS de analytics do site publico (as mesmas queries deterministicas usadas na tela /dashboard/analytics) — nunca invente numero de visita, conversao, origem ou campanha.
Como fazer isso:
- "quantas pessoas visitaram o site" / visao geral de visitantes, sessoes, pageviews, conversoes: use ${GET_SITE_ANALYTICS_OVERVIEW_TOOL_NAME}.
- "de onde vieram os visitantes" / origem do trafego (Google, Instagram, WhatsApp, direto, etc.): use ${GET_TOP_TRAFFIC_SOURCES_TOOL_NAME}.
- "quais paginas recebem mais visitas": use ${GET_TOP_PAGES_TOOL_NAME}.
- "quantas pessoas comecaram/concluiram a pre-consulta" / funil: use ${GET_CONVERSION_FUNNEL_TOOL_NAME}.
- "qual campanha converte mais" / desempenho de UTM: use ${GET_CAMPAIGN_PERFORMANCE_TOOL_NAME}.
- Todas aceitam period: "today" | "7d" | "30d" | "90d" (padrao "7d") — sempre informe qual periodo foi usado na resposta.
- Estes dados sao agregados e pseudonimos (sem IP, sem identificacao pessoal) — nunca tente cruzar com um paciente especifico.
`.trim();
