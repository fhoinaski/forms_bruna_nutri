"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Globe,
  MousePointerClick,
  Percent,
  Users,
} from "lucide-react";
import { DashboardKpiCard } from "@/components/dashboard/DashboardKpiCard";
import { DashboardPanel, EmptyState, LoadingState } from "@/components/dashboard/DashboardPanel";
import { SessionsTrendChart, type DailySessionsPoint } from "@/components/dashboard/analytics/SessionsTrendChart";
import { TrafficSourceDonut, type TrafficSourceDatum } from "@/components/dashboard/analytics/TrafficSourceDonut";
import { ConversionFunnelPanel, type FunnelStageDatum } from "@/components/dashboard/analytics/ConversionFunnelPanel";
import type { AnalyticsPeriodPreset } from "@/lib/analytics/period";

interface CampaignRow {
  campaign: string;
  source: string | null;
  medium: string | null;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

interface PageStatsRow {
  path: string;
  views: number;
  sessions: number;
  entries: number;
  exits: number;
}

interface LandingPageRow {
  landingPath: string;
  sessions: number;
  conversions: number;
  conversionRate: number;
}

interface BlogRow {
  path: string;
  views: number;
  sessions: number;
  preconsultationStarts: number;
  conversions: number;
}

interface AnalyticsSummary {
  period: { preset: AnalyticsPeriodPreset; from: string; to: string };
  overview: {
    sessions: number;
    pageviews: number;
    conversions: number;
    pagesPerSession: number;
    conversionRate: number;
    avgSessionDurationSeconds: number | null;
  };
  trafficSources: TrafficSourceDatum[];
  campaigns: CampaignRow[];
  topPages: PageStatsRow[];
  landingPages: LandingPageRow[];
  funnel: FunnelStageDatum[];
  blog: BlogRow[];
  health: {
    trackingActive: boolean;
    lastEventAt: string | null;
    events24h: number;
    botsFiltered24h: number;
    internalFiltered24h: number;
  };
  dailySessions: DailySessionsPoint[];
}

const PERIOD_OPTIONS: { value: AnalyticsPeriodPreset; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
];

function formatDuration(seconds: number | null): string | undefined {
  if (seconds === null) return undefined;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes > 0 ? `${minutes}min ${secs}s em média` : `${secs}s em média`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Nunca";
  const date = new Date(iso);
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SiteAnalyticsPage() {
  const [period, setPeriod] = useState<AnalyticsPeriodPreset>("7d");
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/admin/analytics/summary?period=${period}`, { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<AnalyticsSummary>) : null))
      .then((result) => {
        if (result) setData(result);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [period]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold leading-tight text-[#1F1F1C] sm:text-2xl">Analytics do site</h1>
          <p className="text-sm text-[#8A8A85]">Visitas, origem de tráfego e conversões — dados reais, pseudônimos.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-[#E8E8E3] bg-white p-1">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                period === option.value ? "bg-[#4F7D45] text-white" : "text-[#6B6B65] hover:bg-[#FAFAF8]"
              }`}
              aria-pressed={period === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <DashboardKpiCard icon={<Users className="h-4 w-4" />} label="Visitantes" value={loading ? "-" : data?.overview.sessions ?? 0} iconTone="lilac" />
        <DashboardKpiCard icon={<Activity className="h-4 w-4" />} label="Sessões" value={loading ? "-" : data?.overview.sessions ?? 0} iconTone="sage" />
        <DashboardKpiCard icon={<BarChart3 className="h-4 w-4" />} label="Pageviews" value={loading ? "-" : data?.overview.pageviews ?? 0} delta={loading ? undefined : `${data?.overview.pagesPerSession ?? 0} páginas/sessão`} iconTone="peach" />
        <DashboardKpiCard icon={<MousePointerClick className="h-4 w-4" />} label="Conversões" value={loading ? "-" : data?.overview.conversions ?? 0} iconTone="mint" />
        <DashboardKpiCard
          icon={<Percent className="h-4 w-4" />}
          label="Taxa de conversão"
          value={loading ? "-" : `${data?.overview.conversionRate ?? 0}%`}
          delta={loading ? undefined : formatDuration(data?.overview.avgSessionDurationSeconds ?? null)}
          iconTone="sage"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <DashboardPanel title="Evolução de sessões" className="lg:col-span-2">
          {loading ? <LoadingState text="Carregando..." /> : <SessionsTrendChart data={data?.dailySessions ?? []} />}
        </DashboardPanel>
        <DashboardPanel title="Origem do tráfego">
          {loading ? <LoadingState text="Carregando..." /> : <TrafficSourceDonut data={data?.trafficSources ?? []} />}
        </DashboardPanel>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <DashboardPanel title="Funil de pré-consulta" className="lg:col-span-2">
          {loading ? <LoadingState text="Carregando..." /> : <ConversionFunnelPanel stages={data?.funnel ?? []} />}
        </DashboardPanel>
        <DashboardPanel title="Diagnóstico do tracking">
          {loading || !data ? (
            <LoadingState text="Carregando..." />
          ) : (
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center justify-between">
                <span className="text-[#6B6B65]">Status</span>
                <span className={`flex items-center gap-1.5 font-semibold ${data.health.trackingActive ? "text-[#4F7D45]" : "text-[#C0533F]"}`}>
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${data.health.trackingActive ? "bg-[#4F7D45]" : "bg-[#C0533F]"}`} />
                  {data.health.trackingActive ? "Ativo" : "Sem eventos recentes"}
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-[#6B6B65]">Último evento</span>
                <span className="font-semibold text-[#1F1F1C]">{formatTimestamp(data.health.lastEventAt)}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-[#6B6B65]">Eventos (24h)</span>
                <span className="font-semibold text-[#1F1F1C]">{data.health.events24h}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-[#6B6B65]">Bots filtrados (24h)</span>
                <span className="font-semibold text-[#1F1F1C]">{data.health.botsFiltered24h}</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-[#6B6B65]">Interno filtrado (24h)</span>
                <span className="font-semibold text-[#1F1F1C]">{data.health.internalFiltered24h}</span>
              </li>
            </ul>
          )}
        </DashboardPanel>
      </div>

      <DashboardPanel title="Campanhas (UTM)">
        {loading ? (
          <LoadingState text="Carregando..." />
        ) : !data || data.campaigns.length === 0 ? (
          <EmptyState text="Nenhuma campanha com UTM registrada no período." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B6B65]">
                  <th className="pb-2 pr-3">Campanha</th>
                  <th className="pb-2 pr-3">Source</th>
                  <th className="pb-2 pr-3">Medium</th>
                  <th className="pb-2 pr-3 text-right">Sessões</th>
                  <th className="pb-2 pr-3 text-right">Conversões</th>
                  <th className="pb-2 text-right">Taxa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F1EE]">
                {data.campaigns.map((row) => (
                  <tr key={row.campaign}>
                    <td className="py-2 pr-3 font-medium text-[#1F1F1C]">{row.campaign}</td>
                    <td className="py-2 pr-3 text-[#6B6B65]">{row.source ?? "-"}</td>
                    <td className="py-2 pr-3 text-[#6B6B65]">{row.medium ?? "-"}</td>
                    <td className="py-2 pr-3 text-right text-[#1F1F1C]">{row.sessions}</td>
                    <td className="py-2 pr-3 text-right text-[#1F1F1C]">{row.conversions}</td>
                    <td className="py-2 text-right font-semibold text-[#4F7D45]">{row.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardPanel>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <DashboardPanel title="Páginas mais visitadas">
          {loading ? (
            <LoadingState text="Carregando..." />
          ) : !data || data.topPages.length === 0 ? (
            <EmptyState text="Sem pageviews no período." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B6B65]">
                    <th className="pb-2 pr-3">Página</th>
                    <th className="pb-2 pr-3 text-right">Views</th>
                    <th className="pb-2 pr-3 text-right">Entradas</th>
                    <th className="pb-2 text-right">Saídas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F1EE]">
                  {data.topPages.map((row) => (
                    <tr key={row.path}>
                      <td className="max-w-[200px] truncate py-2 pr-3 font-medium text-[#1F1F1C]">{row.path}</td>
                      <td className="py-2 pr-3 text-right text-[#1F1F1C]">{row.views}</td>
                      <td className="py-2 pr-3 text-right text-[#1F1F1C]">{row.entries}</td>
                      <td className="py-2 text-right text-[#1F1F1C]">{row.exits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel title="Landing pages">
          {loading ? (
            <LoadingState text="Carregando..." />
          ) : !data || data.landingPages.length === 0 ? (
            <EmptyState text="Sem sessões no período." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B6B65]">
                    <th className="pb-2 pr-3">Landing page</th>
                    <th className="pb-2 pr-3 text-right">Sessões</th>
                    <th className="pb-2 pr-3 text-right">Conversões</th>
                    <th className="pb-2 text-right">Taxa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F1EE]">
                  {data.landingPages.map((row) => (
                    <tr key={row.landingPath}>
                      <td className="max-w-[200px] truncate py-2 pr-3 font-medium text-[#1F1F1C]">{row.landingPath}</td>
                      <td className="py-2 pr-3 text-right text-[#1F1F1C]">{row.sessions}</td>
                      <td className="py-2 pr-3 text-right text-[#1F1F1C]">{row.conversions}</td>
                      <td className="py-2 text-right font-semibold text-[#4F7D45]">{row.conversionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashboardPanel>
      </div>

      <DashboardPanel title="Blog — desempenho por post">
        {loading ? (
          <LoadingState text="Carregando..." />
        ) : !data || data.blog.length === 0 ? (
          <EmptyState text="Nenhuma visualização de post no período." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6B6B65]">
                  <th className="pb-2 pr-3">Post</th>
                  <th className="pb-2 pr-3 text-right">Views</th>
                  <th className="pb-2 pr-3 text-right">Sessões</th>
                  <th className="pb-2 pr-3 text-right">Início pré-consulta</th>
                  <th className="pb-2 text-right">Conversões</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F1EE]">
                {data.blog.map((row) => (
                  <tr key={row.path}>
                    <td className="max-w-[220px] truncate py-2 pr-3 font-medium text-[#1F1F1C]">{row.path}</td>
                    <td className="py-2 pr-3 text-right text-[#1F1F1C]">{row.views}</td>
                    <td className="py-2 pr-3 text-right text-[#1F1F1C]">{row.sessions}</td>
                    <td className="py-2 pr-3 text-right text-[#1F1F1C]">{row.preconsultationStarts}</td>
                    <td className="py-2 text-right font-semibold text-[#4F7D45]">{row.conversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardPanel>

      <p className="px-1 text-xs leading-5 text-[#B0B0AA]">
        Dados first-party e pseudônimos: referrer pode ser removido pelo navegador, bloqueadores de anúncio podem impedir o
        envio, cookies podem ser apagados pelo visitante e conversões entre dispositivos diferentes não são identificáveis.
        Fontes: <Globe className="inline h-3 w-3 align-text-top" aria-hidden="true" /> UTM tem prioridade sobre referrer na
        classificação de origem.
      </p>
    </div>
  );
}
