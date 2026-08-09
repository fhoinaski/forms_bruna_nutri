"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleHelp, X } from "lucide-react";
import { dashboardHelpTopics, type HelpTopicKey } from "@/lib/help/content";

const topicAnchors: Record<HelpTopicKey, string> = {
  dashboard: "",
  clients: "clients",
  agenda: "agenda",
  "agenda/disponibilidade": "configurar-disponibilidade",
  templates: "templates",
  "templates/receitas": "recipes",
  "templates/educacao": "educacao",
  financeiro: "financeiro",
  oportunidades: "qualificar-oportunidade",
  tarefas: "tarefas",
  protocols: "protocols",
  privacidade: "privacidade",
  blog: "",
  "settings/ai": "ia",
  "settings/security": "seguranca",
};

export function HelpPopover({ topicKey }: { topicKey: HelpTopicKey }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const topic = dashboardHelpTopics[topicKey];
  const anchor = topicAnchors[topicKey];
  const guideHref = anchor ? `/dashboard/ajuda#${anchor}` : "/dashboard/ajuda";

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label="Ajuda sobre esta página"
        aria-expanded={open}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#EDE1D6] bg-[#FFFDFC] text-[#8C6E52] shadow-sm transition hover:border-[#D9E4D3] hover:bg-[#F7FAF5] hover:text-[#607A56]"
      >
        <CircleHelp className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed right-3 top-[4.5rem] z-40 w-[calc(100vw-1.5rem)] max-w-80 overflow-hidden rounded-lg border border-[#EDE1D6] bg-[#FFFDFC] text-left shadow-xl sm:absolute sm:right-0 sm:top-11 sm:w-80">
          <div className="flex items-start justify-between gap-3 border-b border-[#EDE1D6] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#3A3028]">{topic.title}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#607A56]">Ajuda rapida</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8C6E52] hover:bg-[#FBF7F1]"
              aria-label="Fechar ajuda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-4">
            <p className="text-sm leading-6 text-[#75675E]">{topic.body}</p>
            <Link
              href={guideHref}
              onClick={() => setOpen(false)}
              className="mt-4 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] hover:text-[#B47F6A]"
            >
              Ver guia completo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
