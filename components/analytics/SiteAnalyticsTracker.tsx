"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackPageView } from "@/lib/analytics/client-tracker";

function TrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedKey = useRef<string | null>(null);

  useEffect(() => {
    const key = `${pathname}?${searchParams?.toString() ?? ""}`;
    // Evita disparo duplicado (React Strict Mode monta/desmonta em dev, e
    // re-renders com os mesmos params nao devem virar novo PAGE_VIEW).
    if (lastTrackedKey.current === key) return;
    lastTrackedKey.current = key;
    trackPageView(pathname);
  }, [pathname, searchParams]);

  return null;
}

/**
 * Tracker de analytics first-party montado uma vez no layout raiz. Cobre
 * todas as rotas publicas (inclui /portal, que tambem e instrumentado —
 * PORTAL_LOGIN_OPENED). Paginas /dashboard tambem carregam este componente
 * (mesmo layout raiz), mas o backend marca essas requisicoes is_internal=1
 * automaticamente (cookie de sessao admin), entao nao poluem os KPIs.
 */
export function SiteAnalyticsTracker() {
  return (
    <Suspense fallback={null}>
      <TrackerInner />
    </Suspense>
  );
}
