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
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#7F9A74] text-sm font-semibold text-white shadow-[0_12px_26px_rgba(127,154,116,0.22)]">
          {number}
        </div>
        {!last && (
          <div className="mt-3 w-px flex-1 bg-[#E0D1C4]" style={{ minHeight: "3rem" }} />
        )}
      </div>
      <div className="pb-8">
        <h3 className="mb-2 font-serif text-xl font-semibold leading-tight text-[#3A3028]">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-[#75675E]">{description}</p>
      </div>
    </div>
  );
}
