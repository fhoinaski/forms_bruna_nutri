"use client";

import { Jost, Cormorant_Garamond } from "next/font/google";
import "../globals.css";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Download,
  LogOut,
  ShieldCheck,
  Bot,
  Menu,
  X,
  FileSpreadsheet,
  Users,
  CalendarDays,
  WalletCards,
  ClipboardList,
  BookOpen,
  LibraryBig,
  Newspaper,
  FileBarChart,
  ExternalLink,
  Fingerprint,
  HeartHandshake,
  HelpCircle,
} from "lucide-react";
import { useState } from "react";

const jost = Jost({ subsets: ["latin"], variable: "--font-sans" });
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

function NavLink({
  href,
  icon,
  label,
  external,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = !external && (
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/")
  );

  const cls = `flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
    active
      ? "bg-[#7F9A74] text-white shadow-[0_14px_30px_rgba(127,154,116,0.2)]"
      : "text-[#75675E] hover:bg-[#FBF7F1] hover:text-[#3A3028]"
  }`;

  if (external) {
    return (
      <a href={href} className={cls} onClick={onClick}>
        {icon}
        <span>{label}</span>
      </a>
    );
  }
  return (
    <Link href={href} className={cls} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function LogoutButton({ onAfterClick }: { onAfterClick?: () => void }) {
  const router = useRouter();
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    onAfterClick?.();
    router.push("/login");
  };
  return (
    <button
      onClick={handleLogout}
      className="w-full flex items-center gap-3 px-4 py-3 text-[#75675E] hover:bg-[#FBF7F1] hover:text-[#3A3028] rounded-xl text-sm transition-all"
    >
      <LogOut className="w-4 h-4 shrink-0" />
      <span>Sair</span>
    </button>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-6 py-8 flex flex-col items-center text-center border-b border-[#EDE1D6]">
        <Image
          src="/brand/bruna-flores-nutri-simbolo.svg"
          alt=""
          width={64}
          height={80}
          className="mb-3 h-20 w-16 object-contain drop-shadow-[0_10px_18px_rgba(58,48,40,0.08)]"
        />
        <p className="font-serif font-semibold text-[#3A3028] leading-tight">Bruna Flores</p>
        <p className="text-[10px] tracking-[0.2em] text-[#607A56] uppercase mt-0.5">Painel clínico</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        <NavLink
          href="/dashboard"
          icon={<LayoutDashboard className="w-4 h-4 shrink-0" />}
          label="Dashboard"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/agenda"
          icon={<CalendarDays className="w-4 h-4 shrink-0" />}
          label="Agenda"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/oportunidades"
          icon={<HeartHandshake className="w-4 h-4 shrink-0" />}
          label="Oportunidades"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/financeiro"
          icon={<WalletCards className="w-4 h-4 shrink-0" />}
          label="Financeiro"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/tarefas"
          icon={<ClipboardList className="w-4 h-4 shrink-0" />}
          label="Tarefas"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/clients"
          icon={<Users className="w-4 h-4 shrink-0" />}
          label="Clientes"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/protocols"
          icon={<BookOpen className="w-4 h-4 shrink-0" />}
          label="Protocolos"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/templates"
          icon={<LibraryBig className="w-4 h-4 shrink-0" />}
          label="Modelos"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/blog"
          icon={<Newspaper className="w-4 h-4 shrink-0" />}
          label="Blog"
          onClick={onClose}
        />

        <div className="pt-2 pb-1">
          <div className="h-px bg-[#EDE1D6]/80 mx-1" />
        </div>

        <p className="px-4 py-1 text-[9px] font-semibold tracking-[0.15em] text-[#A9978A] uppercase">
          Formulários
        </p>
        <NavLink
          href="/api/admin/export/csv"
          icon={<Download className="w-4 h-4 shrink-0" />}
          label="Exportar CSV"
          external
          onClick={onClose}
        />
        <NavLink
          href="/api/admin/export/excel"
          icon={<FileSpreadsheet className="w-4 h-4 shrink-0" />}
          label="Exportar Excel"
          external
          onClick={onClose}
        />

        <div className="pt-2 pb-1">
          <div className="h-px bg-[#EDE1D6]/80 mx-1" />
        </div>

        <p className="px-4 py-1 text-[9px] font-semibold tracking-[0.15em] text-[#A9978A] uppercase">
          Sistema
        </p>
        <NavLink
          href="/dashboard/clients"
          icon={<FileBarChart className="w-4 h-4 shrink-0" />}
          label="Relatórios"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/settings/security"
          icon={<ShieldCheck className="w-4 h-4 shrink-0" />}
          label="Segurança"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/settings/ai"
          icon={<Bot className="w-4 h-4 shrink-0" />}
          label="IA"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/privacidade"
          icon={<Fingerprint className="w-4 h-4 shrink-0" />}
          label="Privacidade"
          onClick={onClose}
        />
        <NavLink
          href="/dashboard/ajuda"
          icon={<HelpCircle className="w-4 h-4 shrink-0" />}
          label="Ajuda"
          onClick={onClose}
        />
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-5 space-y-1 border-t border-[#EDE1D6] pt-4">
        <LogoutButton onAfterClick={onClose} />
        <div className="mt-3 px-4">
          <div className="flex items-center gap-2 text-[10px] text-[#A9978A]">
            <span className="w-1.5 h-1.5 bg-[#7F9A74] rounded-full" />
            Sistema ativo
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className={`${jost.variable} ${cormorant.variable} dashboard-shell font-sans min-h-screen bg-[#FBF7F1] text-[#3A3028]`}
    >
      {/* Desktop sidebar */}
      <aside className="fixed top-0 left-0 bottom-0 w-64 bg-[#FFFDFC]/90 backdrop-blur-xl border-r border-[#EDE1D6] hidden lg:block z-30">
        <Sidebar />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-72 bg-[#FFFDFC] backdrop-blur border-r border-[#EDE1D6] z-50 transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[#FBF7F1] text-[#75675E]"
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
        <Sidebar onClose={() => setMobileOpen(false)} />
      </aside>

      {/* Main */}
      <div className="lg:pl-64 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-16 bg-[#FFFDFC]/86 backdrop-blur-xl border-b border-[#EDE1D6] flex items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-[#FBF7F1] text-[#75675E]"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="font-serif font-semibold text-[#3A3028] text-lg hidden sm:block">
              Painel Administrativo
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/ajuda"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-[#8C6E52] border border-[#D9C4B2] rounded-full px-4 py-2 hover:bg-[#FBF7F1] transition-colors"
            >
              Ajuda
              <HelpCircle className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-[#607A56] border border-[#7F9A74]/35 rounded-full px-4 py-2 hover:bg-[#EAF0E4] transition-colors"
            >
              Ver site
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <Image src="/favicon-512.png" alt="" width={36} height={36} className="h-9 w-9 rounded-full object-contain" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-5 lg:p-8">
          {children}
        </main>

        <footer className="px-8 py-3 border-t border-[#EDE1D6] bg-[#FFFDFC]/70 flex items-center justify-between text-[10px] text-[#A9978A] uppercase tracking-widest">
          <span>© {new Date().getFullYear()} Bruna Flores Nutri</span>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[#7F9A74] rounded-full" />
            Operacional
          </div>
        </footer>
      </div>
    </div>
  );
}
