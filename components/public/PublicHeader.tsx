"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { siteConfig } from "@/lib/seo/site";

const NAV_LINKS = [
  { href: "/", label: "Início" },
  { href: "/#sobre", label: "Sobre" },
  { href: "/servicos", label: "Serviços" },
  { href: "/como-funciona", label: "Como funciona" },
  { href: "/blog", label: "Blog" },
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
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "border-b border-[#EDE1D6]/80 bg-[#FFFDFC]/[0.92] shadow-sm backdrop-blur-xl"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-3"
            aria-label="Ir para a página inicial de Bruna Flores Nutri"
          >
            <Image
              src="/brand/bruna-flores-nutri-simbolo.svg"
              alt=""
              width={40}
              height={44}
              className="h-11 w-10 object-contain drop-shadow-[0_10px_18px_rgba(58,48,40,0.1)]"
            />
            <div className="hidden sm:block">
              <p className="font-serif text-sm font-semibold leading-tight text-[#3A3028]">
                Bruna Flores Nutri
              </p>
              <p className="text-[9px] uppercase leading-none tracking-[0.2em] text-[#75675E]">
                Nutricionista
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full px-3.5 py-2 text-sm text-[#75675E] transition-colors hover:bg-[#FBF7F1] hover:text-[#3A3028]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/formulario"
              className="brand-btn-primary hidden px-4 py-2 text-xs lg:inline-flex"
            >
              Pré-consulta
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <a
              href={siteConfig.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-full border border-[#7F9A74]/35 px-4 py-2 text-xs font-semibold text-[#607A56] transition-colors hover:bg-[#EAF0E4] xl:inline-flex"
              aria-label="Falar com Bruna Flores pelo WhatsApp"
            >
              WhatsApp
            </a>
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-[#75675E] hover:bg-[#FBF7F1] lg:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={`fixed bottom-0 right-0 top-0 z-[60] w-72 bg-[#FFFDFC] shadow-xl transition-transform duration-300 lg:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#EDE1D6] p-5">
          <p className="font-serif font-semibold text-[#3A3028]">Bruna Flores Nutri</p>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-[#75675E] hover:bg-[#FBF7F1]"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1 p-5">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-4 py-3 text-sm text-[#3A3028] transition-colors hover:bg-[#FBF7F1]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="absolute inset-x-5 bottom-8">
          <a
            href={siteConfig.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 inline-flex w-full items-center justify-center rounded-full border border-[#7F9A74]/35 px-5 py-3 text-sm font-semibold text-[#607A56]"
            aria-label="Falar com Bruna Flores pelo WhatsApp"
          >
            Falar pelo WhatsApp
          </a>
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
