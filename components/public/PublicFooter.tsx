import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="bg-[#3A2B1F] text-[#EAD8C2]">
      <div className="max-w-6xl mx-auto px-5 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 bg-[#7A9A74] rounded-full flex items-center justify-center">
                <span className="font-serif italic text-sm text-white leading-none">BF</span>
              </div>
              <p className="font-serif text-white font-semibold">Bruna Flores Nutri</p>
            </div>
            <p className="text-[10px] tracking-[0.2em] text-[#8C6E52] uppercase">
              Nutrição Materno-Infantil
            </p>
            <p className="text-sm text-[#A8927D] mt-4 max-w-xs leading-relaxed">
              Atendimento nutricional acolhedor e individualizado para gestantes,
              mães e crianças.
            </p>
          </div>

          {/* Links */}
          <div className="flex gap-12">
            <div>
              <p className="text-[10px] tracking-widest uppercase text-[#8C6E52] mb-3">
                Navegação
              </p>
              <ul className="space-y-2 text-sm text-[#A8927D]">
                <li><Link href="/" className="hover:text-white transition-colors">Início</Link></li>
                <li><Link href="/servicos" className="hover:text-white transition-colors">Serviços</Link></li>
                <li><Link href="/como-funciona" className="hover:text-white transition-colors">Como funciona</Link></li>
                <li><Link href="/formulario" className="hover:text-white transition-colors">Pré-consulta</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[#5A4030]/60 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-[#6B5040]">
          <p>© {new Date().getFullYear()} Bruna Flores Nutri. Todos os direitos reservados.</p>
          <Link href="/login" className="hover:text-[#A8927D] transition-colors">
            Área restrita
          </Link>
        </div>
      </div>
    </footer>
  );
}
