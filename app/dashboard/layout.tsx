"use client";

import { Jost, Cormorant_Garamond } from "next/font/google";
import "../globals.css";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Download,
  LogOut,
  ShieldCheck,
  Menu,
  X,
  FileSpreadsheet,
  Users,
  BookOpen,
  Sparkles,
  FileBarChart,
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
      ? "bg-[#7A9A74] text-white shadow-sm"
      : "text-[#8C6E52] hover:bg-[#FAF7F2] hover:text-[#3A2B1F]"
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
      className="w-full flex items-center gap-3 px-4 py-3 text-[#8C6E52] hover:bg-[#FAF7F2] hover:text-[#3A2B1F] rounded-xl text-sm transition-all"
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
      <div className="px-6 py-8 flex flex-col items-center text-center border-b border-[#EAD8C2]">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-3 shadow-sm border-2 border-[#7A9A74]/40">
          <span className="font-serif italic text-xl text-[#7A9A74]">BF</span>
        </div>
        <p className="font-serif font-semibold text-[#B47F6A] leading-tight">Bruna Flores</p>
        <p className="text-[10px] tracking-[0.2em] text-[#7A9A74] uppercase mt-0.5">Nutrição Materna</p>
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

        <div className="pt-2 pb-1">
          <div className="h-px bg-[#EAD8C2]/60 mx-1" />
        </div>

        <p className="px-4 py-1 text-[9px] font-semibold tracking-[0.15em] text-[#A8927D] uppercase">
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
          <div className="h-px bg-[#EAD8C2]/60 mx-1" />
        </div>

        <p className="px-4 py-1 text-[9px] font-semibold tracking-[0.15em] text-[#A8927D] uppercase">
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
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-5 space-y-1 border-t border-[#EAD8C2] pt-4">
        <LogoutButton onAfterClick={onClose} />
        <div className="mt-3 px-4">
          <div className="flex items-center gap-2 text-[10px] text-[#A8927D]">
            <span className="w-1.5 h-1.5 bg-[#7A9A74] rounded-full" />
            Sistema operacional
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
      className={`${jost.variable} ${cormorant.variable} font-sans min-h-screen bg-[#FAF7F2] text-[#3A2B1F]`}
    >
      {/* Desktop sidebar */}
      <aside className="fixed top-0 left-0 bottom-0 w-60 bg-[#EAD8C2]/60 backdrop-blur-sm border-r border-[#EAD8C2] hidden lg:block z-30">
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
        className={`fixed top-0 left-0 bottom-0 w-64 bg-[#EAD8C2]/95 backdrop-blur border-r border-[#EAD8C2] z-50 transition-transform duration-300 lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-[#FAF7F2] text-[#8C6E52]"
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
        <Sidebar onClose={() => setMobileOpen(false)} />
      </aside>

      {/* Main */}
      <div className="lg:pl-60 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur border-b border-[#EAD8C2] flex items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-[#FAF7F2] text-[#8C6E52]"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="font-serif font-semibold text-[#7A9A74] text-lg hidden sm:block">
              Painel Administrativo
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden sm:inline-flex items-center text-xs font-medium text-[#7A9A74] border border-[#7A9A74]/40 rounded-full px-4 py-1.5 hover:bg-[#7A9A74]/10 transition-colors"
            >
              Ver formulário
            </Link>
            <div className="w-8 h-8 bg-[#F4C9C6] rounded-full flex items-center justify-center">
              <span className="text-[#B47F6A] font-bold text-[10px]">BF</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-5 lg:p-8">
          {children}
        </main>

        <footer className="px-8 py-3 border-t border-[#EAD8C2] bg-white/60 flex items-center justify-between text-[10px] text-[#A8927D] uppercase tracking-widest">
          <span>© {new Date().getFullYear()} Bruna Flores Nutri</span>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[#7A9A74] rounded-full" />
            Operacional
          </div>
        </footer>
      </div>
    </div>
  );
}
