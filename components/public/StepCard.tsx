export function StepCard({
  number,
  title,
  description,
  last = false,
}: {
  number: string;
  title: string;
  description: string;
  last?: boolean;
}) {
  return (
    <div className="flex gap-5">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-10 h-10 rounded-full bg-[#7A9A74] flex items-center justify-center text-white font-serif font-bold text-sm shadow-sm">
          {number}
        </div>
        {!last && (
          <div className="w-px flex-1 mt-3 bg-[#EAD8C2]" style={{ minHeight: "3rem" }} />
        )}
      </div>
      <div className="pb-8">
        <h3 className="font-serif text-xl font-semibold text-[#3A2B1F] mb-2 leading-tight">
          {title}
        </h3>
        <p className="text-sm text-[#8C6E52] leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
