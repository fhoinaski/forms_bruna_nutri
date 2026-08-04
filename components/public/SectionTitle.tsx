export function SectionTitle({
  kicker,
  title,
  subtitle,
  center = false,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  center?: boolean;
}) {
  return (
    <div className={center ? "text-center" : ""}>
      {kicker && (
        <p className="brand-kicker mb-3">{kicker}</p>
      )}
      <h2 className="font-serif text-3xl font-semibold leading-tight text-[#3A3028] md:text-5xl">
        {title}
      </h2>
      {subtitle && (
        <p className={`mt-5 max-w-2xl text-base leading-relaxed text-[#75675E] ${center ? "mx-auto" : ""}`}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
