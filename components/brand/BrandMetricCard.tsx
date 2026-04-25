import { type ReactNode } from "react";

export function BrandMetricCard({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="brand-card p-5 flex justify-between items-end">
      <div>
        <p className="brand-kicker mb-1.5">{label}</p>
        <p
          className={`text-3xl font-serif font-bold leading-none ${
            accent ? "text-[#B47F6A]" : "text-[#7A9A74]"
          }`}
        >
          {value}
        </p>
      </div>
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center ${
          accent ? "bg-[#F4C9C6]/40" : "bg-[#7A9A74]/10"
        }`}
      >
        {icon}
      </div>
    </div>
  );
}
