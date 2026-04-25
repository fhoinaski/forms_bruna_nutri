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
      <h2 className="font-serif text-3xl md:text-4xl font-semibold text-[#3A2B1F] leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-[#8C6E52] leading-relaxed text-base max-w-2xl">
          {subtitle}
        </p>
      )}
    </div>
  );
}
