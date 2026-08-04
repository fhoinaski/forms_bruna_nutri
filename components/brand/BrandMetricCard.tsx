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
    <div className="rounded-[1.35rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_18px_45px_rgba(58,48,40,0.055)] transition-shadow hover:shadow-[0_24px_58px_rgba(58,48,40,0.08)] flex justify-between items-end">
      <div>
        <p className="brand-kicker mb-1.5">{label}</p>
        <p
          className={`text-3xl font-serif font-bold leading-none ${
            accent ? "text-[#8C5F50]" : "text-[#607A56]"
          }`}
        >
          {value}
        </p>
      </div>
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center ${
          accent ? "bg-[#F3E8E5] text-[#8C5F50]" : "bg-[#EAF0E4] text-[#607A56]"
        }`}
      >
        {icon}
      </div>
    </div>
  );
}
