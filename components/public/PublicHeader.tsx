"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Início" },
  { href: "/#sobre", label: "Sobre" },
  { href: "/servicos", label: "Serviços" },
  { href: "/como-funciona", label: "Como funciona" },
  { href: "/formulario", label: "Pré-consulta" },
];

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/95 backdrop-blur shadow-sm border-b border-[#EAD8C2]"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 bg-[#7A9A74] rounded-full flex items-center justify-center">
              <span className="font-serif italic text-sm text-white leading-none">BF</span>
            </div>
            <div className="hidden sm:block">
              <p className="font-serif text-[#3A2B1F] font-semibold text-sm leading-tight">
                Bruna Flores Nutri
              </p>
              <p className="text-[9px] tracking-[0.18em] text-[#8C6E52] uppercase leading-none">
                Nutrição Materna
              </p>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="px-3.5 py-2 text-sm text-[#8C6E52] hover:text-[#3A2B1F] transition-colors rounded-lg hover:bg-[#FAF7F2]"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center text-xs font-medium text-[#7A9A74] border border-[#7A9A74]/50 rounded-full px-4 py-1.5 hover:bg-[#7A9A74]/10 transition-colors"
            >
              Acessar painel
            </Link>
            <Link
              href="/formulario"
              className="brand-btn-primary text-xs px-4 py-2 hidden lg:inline-flex"
            >
              Pré-consulta
            </Link>
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-[#FAF7F2] text-[#8C6E52]"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed top-0 right-0 bottom-0 w-72 bg-white z-[60] lg:hidden transition-transform duration-300 shadow-xl ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-[#EAD8C2]">
          <p className="font-serif text-[#B47F6A] font-semibold">Bruna Flores Nutri</p>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg hover:bg-[#FAF7F2] text-[#8C6E52]"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="p-5 space-y-1">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-sm text-[#3A2B1F] hover:bg-[#FAF7F2] rounded-xl transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-sm text-[#7A9A74] hover:bg-[#FAF7F2] rounded-xl transition-colors"
          >
            Acessar painel
          </Link>
        </nav>
        <div className="absolute bottom-8 inset-x-5">
          <Link
            href="/formulario"
            onClick={() => setOpen(false)}
            className="brand-btn-primary w-full text-sm"
          >
            Preencher pré-consulta
          </Link>
        </div>
      </div>
    </>
  );
}
