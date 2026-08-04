import { type ReactNode } from "react";

export function ServiceCard({
  icon,
  title,
  description,
  accent = "sage",
}: {
  icon: ReactNode;
  title: string;
  description: string;
  accent?: "sage" | "fig" | "rose";
}) {
  const accentClass = {
    sage: "bg-[#EAF0E4] text-[#607A56]",
    fig: "bg-[#F3E8E5] text-[#8C5F50]",
    rose: "bg-[#F7E3DE] text-[#9A6654]",
  }[accent];
  const borderClass = {
    sage: "border-t-[#BFD1B7]",
    fig: "border-t-[#E2C7BD]",
    rose: "border-t-[#E8C5BD]",
  }[accent];

  return (
    <div className={`group relative min-h-[15rem] overflow-hidden rounded-[1.35rem] border border-t-4 border-[#EDE1D6] ${borderClass} bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_58px_rgba(58,48,40,0.085)]`}>
      <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${accentClass}`}>
        {icon}
      </div>
      <h3 className="mb-3 font-serif text-xl font-semibold leading-tight text-[#3A3028]">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-[#75675E]">{description}</p>
      <div className="mt-6 h-px w-12 bg-[#D8C7BA] transition-all duration-300 group-hover:w-24" />
    </div>
  );
}
