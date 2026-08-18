import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function DashboardPanel({
  title,
  action,
  actionHref,
  children,
  className = "",
}: {
  title: string;
  action?: string;
  actionHref?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-[#E8E8E3] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,32,0.04)] ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-[#1F1F1C]">{title}</h2>
        {action && actionHref && (
          <Link
            href={actionHref}
            className="inline-flex shrink-0 items-center gap-1 rounded text-xs font-semibold text-[#4F7D45] hover:text-[#3D6335] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F7D45]"
          >
            {action}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  text,
  actionLabel,
  actionHref,
}: {
  text: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-[#F7F7F4] px-3 py-5 text-center">
      <p className="text-[13px] text-[#6B6B65]">{text}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="text-xs font-semibold text-[#4F7D45] hover:text-[#3D6335] focus-visible:underline"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export function LoadingState({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-[13px] text-[#B0B0AA]" role="status" aria-live="polite">{text}</p>
  );
}
