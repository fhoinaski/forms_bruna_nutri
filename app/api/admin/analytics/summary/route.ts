import { NextRequest, NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/auth/session";
import { ANALYTICS_PERIOD_PRESETS, resolveAnalyticsPeriod, type AnalyticsPeriodPreset } from "@/lib/analytics/period";
import {
  getAnalyticsHealth,
  getAnalyticsOverview,
  getBlogAnalytics,
  getCampaigns,
  getConversionFunnel,
  getLandingPages,
  getSessionsByDay,
  getTopPages,
  getTrafficSources,
} from "@/lib/repositories/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidPreset(value: string | null): value is AnalyticsPeriodPreset {
  return !!value && (ANALYTICS_PERIOD_PRESETS as readonly string[]).includes(value);
}

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return NextResponse.json({ message: "Não autorizado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const presetParam = searchParams.get("period");
  const preset: AnalyticsPeriodPreset = isValidPreset(presetParam) ? presetParam : "7d";
  const customFrom = searchParams.get("from");
  const customTo = searchParams.get("to");

  const period = resolveAnalyticsPeriod(preset, customFrom, customTo);

  const [overview, trafficSources, campaigns, topPages, landingPages, funnel, blog, health, dailySessions] =
    await Promise.all([
      getAnalyticsOverview(period.from, period.to),
      getTrafficSources(period.from, period.to),
      getCampaigns(period.from, period.to),
      getTopPages(period.from, period.to),
      getLandingPages(period.from, period.to),
      getConversionFunnel(period.from, period.to),
      getBlogAnalytics(period.from, period.to),
      getAnalyticsHealth(),
      getSessionsByDay(period.from, period.to),
    ]);

  return NextResponse.json({
    period,
    overview,
    trafficSources,
    campaigns,
    topPages,
    landingPages,
    funnel,
    blog,
    health,
    dailySessions,
  });
}
