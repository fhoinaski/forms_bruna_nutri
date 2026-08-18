import Link from "next/link";
import { Sparkles, X } from "lucide-react";

export interface AiInsight {
  text: string;
  href: string;
  label: string;
}

export function AiInsightCard({
  insight,
  onDismiss,
}: {
  insight: AiInsight;
  onDismiss: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#DCEBD6] bg-[#F5FAF3] p-4 shadow-[0_1px_2px_rgba(16,24,32,0.04)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EAF2E7] text-[#4F7D45]">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#4F7D45]">Sugestão da IA</p>
          <p className="mt-0.5 text-sm text-[#3A3A35]">{insight.text}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={insight.href}
          className="inline-flex items-center rounded-lg bg-[#4F7D45] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#3D6335]"
        >
          {insight.label}
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dispensar sugestão"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#8A8A85] transition hover:bg-white hover:text-[#3A3A35]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
