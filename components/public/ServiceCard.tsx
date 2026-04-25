export function ServiceCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="brand-card p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
      <div className="w-12 h-12 bg-[#EAD8C2]/60 rounded-2xl flex items-center justify-center text-2xl mb-4 group-hover:bg-[#EAD8C2] transition-colors">
        {icon}
      </div>
      <h3 className="font-serif text-lg font-semibold text-[#B47F6A] mb-2">{title}</h3>
      <p className="text-sm text-[#8C6E52] leading-relaxed">{description}</p>
    </div>
  );
}
