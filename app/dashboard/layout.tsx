"use client";

import { Cormorant_Garamond, Jost } from "next/font/google";
import "../globals.css";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Bot,
  CalendarDays,
  ClipboardList,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  HeartHandshake,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  MoreHorizontal,
  Newspaper,
  Search,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AiChatWidget } from "@/components/dashboard/AiChatWidget";
import { AssistantPageContextProvider } from "@/lib/ai/context/assistant-page-context";

const jost = Jost({ subsets: ["latin"], variable: "--font-sans" });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const primaryNavigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/clients", label: "Pacientes", icon: Users },
  { href: "/dashboard/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/dashboard/templates", label: "Modelos", icon: LibraryBig },
  { href: "/dashboard/financeiro", label: "Financeiro", icon: WalletCards },
];

const secondaryNavigation = [
  { href: "/dashboard/oportunidades", label: "Oportunidades", icon: HeartHandshake, badgeKey: "oportunidades" },
  { href: "/dashboard/tarefas", label: "Tarefas", icon: ClipboardList, badgeKey: "tarefas" },
  { href: "/dashboard/protocols", label: "Protocolos", icon: ShieldCheck },
  { href: "/dashboard/privacidade", label: "Privacidade", icon: ShieldCheck, badgeKey: "privacidade" },
  { href: "/dashboard/blog", label: "Conteúdo", icon: Newspaper },
  { href: "/dashboard/settings/ai", label: "Inteligência artificial", icon: Bot },
  { href: "/dashboard/ajuda", label: "Central de ajuda", icon: CircleHelp },
];

const breadcrumbLabels: Record<string, string> = {
  dashboard: "Dashboard",
  clients: "Pacientes",
  agenda: "Agenda",
  templates: "Modelos",
  receitas: "Receitas",
  educacao: "Educação",
  financeiro: "Financeiro",
  protocols: "Protocolos",
  oportunidades: "Oportunidades",
  tarefas: "Tarefas",
  privacidade: "Privacidade",
  blog: "Conteúdo",
  settings: "Configurações",
  ai: "Inteligência artificial",
  ajuda: "Ajuda",
  novo: "Novo",
};

type NotificationItem = {
  id: string;
  type: string;
  label: string;
  count: number;
  href: string;
};

type NotificationSummary = {
  items: NotificationItem[];
  totalUnread: number;
  signature: string;
  generatedAt: string;
  badges: {
    tarefas: number;
    oportunidades: number;
    privacidade: number;
  };
};

type BadgeKey = keyof NotificationSummary["badges"];

const NOTIFICATION_SEEN_AT_KEY = "bruna_nutri_notifications_last_seen";
const NOTIFICATION_SEEN_SIGNATURE_KEY = "bruna_nutri_notifications_seen_signature";

function NavLink({ href, label, icon: Icon, collapsed, badgeCount = 0, onClick }: {
  href: string;
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
  badgeCount?: number;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`group relative flex h-11 items-center rounded-lg text-sm font-medium transition-colors ${collapsed ? "justify-center px-2" : "gap-3 px-3"} ${
        active
          ? "bg-[#7F9A74] text-white shadow-[0_8px_22px_rgba(127,154,116,0.18)]"
          : "text-[#75675E] hover:bg-[#FBF7F1] hover:text-[#3A3028]"
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && badgeCount > 0 && (
        <span className={`ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${active ? "bg-white/20 text-white" : "bg-[#EAF0E4] text-[#607A56]"}`}>
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
      {collapsed && badgeCount > 0 && (
        <span className={`absolute right-2 top-2 h-2 w-2 rounded-full ${active ? "bg-white" : "bg-[#C9937B]"}`} />
      )}
    </Link>
  );
}

function Sidebar({ collapsed, mobile = false, onClose, badges = {} }: {
  collapsed: boolean;
  mobile?: boolean;
  onClose?: () => void;
  badges?: Partial<Record<BadgeKey, number>>;
}) {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex h-full flex-col bg-[#FFFDFC]">
      <div className={`flex h-20 items-center border-b border-[#EDE1D6] ${collapsed ? "justify-center px-2" : "gap-3 px-5"}`}>
        <Image src="/brand/bruna-flores-nutri-simbolo.webp" alt="" width={42} height={52} sizes="42px" className="h-12 w-10 object-contain" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-serif text-base font-semibold text-[#3A3028]">Bruna Flores</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#607A56]">Gestão clínica</p>
          </div>
        )}
        {mobile && (
          <button onClick={onClose} className="ml-auto rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1]" aria-label="Fechar menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {!collapsed && <p className="px-3 pb-2 pt-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#A9978A]">Clínica</p>}
        {primaryNavigation.map((item) => <NavLink key={item.href} {...item} collapsed={collapsed} onClick={onClose} />)}

        <div className="pt-3">
          <button
            onClick={() => setMoreOpen((value) => !value)}
            title={collapsed ? "Mais recursos" : undefined}
            className={`flex h-11 w-full items-center rounded-lg text-sm font-medium text-[#75675E] hover:bg-[#FBF7F1] hover:text-[#3A3028] ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`}
          >
            <MoreHorizontal className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <><span className="flex-1 text-left">Mais recursos</span><ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} /></>}
          </button>
          {(moreOpen || collapsed) && (
            <div className={`mt-1 space-y-1 ${collapsed ? "" : "border-l border-[#EDE1D6] pl-2"}`}>
              {secondaryNavigation.map((item) => (
                <NavLink
                  key={item.href}
                  {...item}
                  badgeCount={item.badgeKey ? badges[item.badgeKey as BadgeKey] ?? 0 : 0}
                  collapsed={collapsed}
                  onClick={onClose}
                />
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className="border-t border-[#EDE1D6] p-3">
        <button onClick={logout} title={collapsed ? "Sair" : undefined} className={`flex h-11 w-full items-center rounded-lg text-sm text-[#75675E] hover:bg-[#FBF7F1] hover:text-[#3A3028] ${collapsed ? "justify-center" : "gap-3 px-3"}`}>
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && "Sair"}
        </button>
      </div>
    </div>
  );
}

function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] text-[#75675E] transition-colors hover:bg-[#FBF7F1] hover:text-[#3A3028]">{children}</button>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationSummary, setNotificationSummary] = useState<NotificationSummary | null>(null);
  const [seenNotificationSignature, setSeenNotificationSignature] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; email: string | null; phone: string | null }>>([]);
  const profileRef = useRef<HTMLDivElement>(null);
  const hasUnreadNotifications = !!notificationSummary && notificationSummary.totalUnread > 0 && notificationSummary.signature !== seenNotificationSignature;

  const breadcrumbs = useMemo(() => pathname.split("/").filter(Boolean).map((segment, index, parts) => {
    const isClientDetail = parts[index - 1] === "clients" && index === parts.length - 1;
    const fallbackLabel = segment.replaceAll("-", " ").replace(/\b\w/g, (char) => char.toUpperCase());
    return {
      label: breadcrumbLabels[segment] ?? (isClientDetail ? "Prontuário" : fallbackLabel),
      href: `/${parts.slice(0, index + 1).join("/")}`,
    };
  }), [pathname]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    setSeenNotificationSignature(window.localStorage.getItem(NOTIFICATION_SEEN_SIGNATURE_KEY) ?? "");

    let active = true;
    async function loadNotifications() {
      try {
        const response = await fetch("/api/admin/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as NotificationSummary;
        if (active) {
          setNotificationSummary(result);
        }
      } catch {
        if (active) {
          setNotificationSummary(null);
        }
      }
    }

    void loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: search.trim(), pageSize: "5" });
        const response = await fetch(`/api/admin/clients?${params}`, { signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json() as { items?: Array<{ id: string; name: string; email: string | null; phone: string | null }> };
        setSearchResults(result.items ?? []);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === "AbortError")) setSearchResults([]);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [search]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (searchResults[0]) {
      router.push(`/dashboard/clients/${searchResults[0].id}`);
      setSearch("");
      setSearchResults([]);
    }
  }

  function markNotificationsSeen() {
    if (!notificationSummary) return;
    const now = new Date().toISOString();
    window.localStorage.setItem(NOTIFICATION_SEEN_AT_KEY, now);
    window.localStorage.setItem(NOTIFICATION_SEEN_SIGNATURE_KEY, notificationSummary.signature);
    setSeenNotificationSignature(notificationSummary.signature);
  }

  function toggleNotifications() {
    setNotificationsOpen((value) => {
      const next = !value;
      if (next) {
        markNotificationsSeen();
      }
      return next;
    });
    setProfileOpen(false);
  }

  // Paginas de impressao/PDF sao documentos autonomos (proprio estilo,
  // proprio cabecalho e rodape) e nao devem aparecer dentro da casca do
  // dashboard (menu, busca, sino) nem na tela nem no papel impresso.
  const isStandalonePrintRoute = pathname.endsWith("/print") || pathname.endsWith("/pdf");
  if (isStandalonePrintRoute) {
    return <>{children}</>;
  }

  return (
    <AssistantPageContextProvider>
    <div className={`${jost.variable} ${cormorant.variable} dashboard-shell min-h-screen bg-[#FBF7F1] font-sans text-[#3A3028]`}>
      <aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-[#EDE1D6] transition-[width] duration-200 lg:block ${collapsed ? "w-20" : "w-64"}`}>
        <Sidebar collapsed={collapsed} badges={notificationSummary?.badges} />
        <button onClick={() => setCollapsed((value) => !value)} className="absolute -right-3 top-24 flex h-7 w-7 items-center justify-center rounded-full border border-[#EDE1D6] bg-[#FFFDFC] text-[#75675E] shadow-sm" aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </aside>

      {mobileOpen && <button className="fixed inset-0 z-40 bg-[#3A3028]/25 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[min(19rem,88vw)] border-r border-[#EDE1D6] transition-transform duration-200 lg:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar collapsed={false} mobile badges={notificationSummary?.badges} onClose={() => setMobileOpen(false)} />
      </aside>

      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ${collapsed ? "lg:pl-20" : "lg:pl-64"}`}>
        <header className="sticky top-0 z-20 border-b border-[#EDE1D6] bg-[#FFFDFC]/95 backdrop-blur-xl">
          <div className="flex h-16 min-w-0 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
            <button type="button" onClick={() => setMobileOpen(true)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#75675E] hover:bg-[#FBF7F1] lg:hidden" aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
            <nav className="hidden min-w-0 items-center gap-1 text-xs text-[#A9978A] md:flex" aria-label="Breadcrumb">
              {breadcrumbs.map((item, index) => <span key={item.href} className="flex items-center gap-1"><Link href={item.href} className={`max-w-32 truncate hover:text-[#607A56] ${index === breadcrumbs.length - 1 ? "font-semibold text-[#3A3028]" : ""}`}>{item.label}</Link>{index < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3" />}</span>)}
            </nav>
            <form onSubmit={submitSearch} className="relative mx-auto min-w-0 flex-1 md:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-lg border border-[#EDE1D6] bg-[#FBF7F1] pl-9 pr-3 text-base text-[#3A3028] outline-none placeholder:text-[#A9978A] focus:border-[#7F9A74] focus:ring-4 focus:ring-[#7F9A74]/10 sm:text-sm" placeholder="Buscar paciente..." aria-label="Buscar paciente" />
              {search.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] shadow-xl">
                  {searchResults.length ? searchResults.map((patient) => (
                    <Link key={patient.id} href={`/dashboard/clients/${patient.id}`} onClick={() => { setSearch(""); setSearchResults([]); }} className="flex items-center gap-3 border-b border-[#EDE1D6] px-3 py-3 last:border-0 hover:bg-[#FBF7F1]">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF0E4] text-[#607A56]"><Users className="h-4 w-4" /></span>
                      <span className="min-w-0"><strong className="block truncate text-sm font-semibold text-[#3A3028]">{patient.name}</strong><span className="block truncate text-[11px] text-[#75675E]">{patient.phone || patient.email || "Sem contato cadastrado"}</span></span>
                    </Link>
                  )) : <p className="px-4 py-3 text-xs text-[#75675E]">Nenhum paciente encontrado.</p>}
                </div>
              )}
            </form>
            <div className="flex shrink-0 items-center gap-2">
              <div className="relative">
                <IconButton label="Notificações" onClick={toggleNotifications}>
                  <Bell className="h-4 w-4" />
                  {hasUnreadNotifications && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#C9937B]" />}
                </IconButton>
                {notificationsOpen && (
                  <div className="fixed right-3 top-[4.5rem] w-[calc(100vw-1.5rem)] max-w-80 overflow-hidden rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] shadow-xl sm:absolute sm:right-0 sm:top-12 sm:w-80">
                    <div className="border-b border-[#EDE1D6] px-4 py-3">
                      <p className="text-sm font-semibold text-[#3A3028]">Notificações</p>
                      <p className="mt-1 text-[11px] text-[#75675E]">Resumo de pendências do sistema.</p>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-2">
                      {notificationSummary?.items.length ? notificationSummary.items.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setNotificationsOpen(false)}
                          className="flex items-start justify-between gap-3 rounded-md px-3 py-2.5 text-sm text-[#5F554D] transition-colors hover:bg-[#FBF7F1] hover:text-[#3A3028]"
                        >
                          <span className="leading-5">{item.label}</span>
                          <span className="mt-0.5 shrink-0 rounded-full bg-[#EAF0E4] px-2 py-0.5 text-[10px] font-bold text-[#607A56]">
                            {item.count > 99 ? "99+" : item.count}
                          </span>
                        </Link>
                      )) : (
                        <p className="px-3 py-4 text-xs leading-5 text-[#75675E]">Nenhuma pendência aberta no momento.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div ref={profileRef} className="relative">
                <button type="button" onClick={() => { setProfileOpen((value) => !value); setNotificationsOpen(false); }} className="flex h-10 min-w-10 shrink-0 items-center gap-2 rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] px-1 text-left hover:bg-[#FBF7F1] xl:px-1.5 xl:pr-2">
                  <Image src="/favicon-512.png" alt="Perfil de Bruna Flores" width={32} height={32} className="h-8 w-8 rounded-md object-contain" />
                  <span className="hidden text-xs font-semibold text-[#3A3028] xl:block">Bruna Flores</span>
                  <ChevronDown className="hidden h-3.5 w-3.5 text-[#75675E] xl:block" />
                </button>
                {profileOpen && <div className="absolute right-0 top-12 w-56 rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] p-2 shadow-xl"><Link href="/dashboard/settings/security" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#75675E] hover:bg-[#FBF7F1]"><Settings className="h-4 w-4" />Configurações</Link><Link href="/" target="_blank" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#75675E] hover:bg-[#FBF7F1]"><ExternalLink className="h-4 w-4" />Ver site</Link></div>}
              </div>
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      <AiChatWidget />
    </div>
    </AssistantPageContextProvider>
  );
}
