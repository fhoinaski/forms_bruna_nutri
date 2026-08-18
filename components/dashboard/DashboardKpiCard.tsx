import Link from "next/link";
import type { ReactNode } from "react";

export function DashboardKpiCard({
  icon,
  label,
  value,
  delta,
  deltaTone = "neutral",
  href,
  iconTone = "sage",
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  delta?: string | null;
  deltaTone?: "positive" | "neutral" | "warning";
  href?: string;
  iconTone?: "sage" | "lilac" | "peach" | "mint";
}) {
  const iconClasses: Record<string, string> = {
    sage: "bg-[#EAF2E7] text-[#4F7D45]",
    lilac: "bg-[#EFEAF7] text-[#7A6BAE]",
    peach: "bg-[#FBEEE4] text-[#C08552]",
    mint: "bg-[#E6F4EC] text-[#3E9166]",
  };
  const deltaClasses: Record<string, string> = {
    positive: "text-[#4F7D45]",
    neutral: "text-[#8A8A85]",
    warning: "text-[#C0673F]",
  };

  const content = (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#E8E8E3] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,32,0.04)] transition hover:border-[#4F7D45]/35 hover:shadow-[0_2px_8px_rgba(16,24,32,0.06)]">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClasses[iconTone]}`}>
          {icon}
        </span>
        <p className="text-[13px] font-medium text-[#6B6B65]">{label}</p>
      </div>
      <p className="mt-2.5 font-sans text-[26px] font-bold leading-none text-[#1F1F1C]">{value}</p>
      {delta && <p className={`mt-1.5 text-xs font-medium ${deltaClasses[deltaTone]}`}>{delta}</p>}
    </div>
  );

  if (href) {
    const accessibleLabel = `${label}: ${value}${delta ? `, ${delta}` : ""}`;
    return (
      <Link
        href={href}
        className="block h-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F7D45]"
        aria-label={accessibleLabel}
      >
        {content}
      </Link>
    );
  }
  return content;
}
