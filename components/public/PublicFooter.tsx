import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { siteConfig } from "@/lib/seo/site";

export function PublicFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-[#EDE1D6] bg-[#F6ECE4] text-[#3A3028]">
      <div className="absolute inset-0 brand-texture opacity-30" />
      <div className="relative z-10 mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <Image
                src="/brand/bruna-flores-nutri-simbolo.webp"
                alt=""
                width={40}
                height={48}
                sizes="40px"
                className="h-12 w-10 object-contain"
              />
              <div>
                <p className="font-serif text-xl font-semibold text-[#3A3028]">
                  Bruna Flores Nutri
                </p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#607A56]">
                  Nutricionista em Florianópolis e online · {siteConfig.professionalRegistration}
                </p>
              </div>
            </div>
            <p className="max-w-xl text-sm leading-7 text-[#75675E]">
              Atendimento nutricional acolhedor e individualizado para adultos,
              gestantes, mães, bebês e crianças, com ciência aplicada à vida real.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <a href={siteConfig.phoneHref} className="font-semibold text-[#607A56] transition hover:text-[#8C5F50]">
                {siteConfig.phoneDisplay}
              </a>
              <a
                href={siteConfig.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#607A56] transition hover:text-[#8C5F50]"
                aria-label="Falar com Bruna Flores pelo WhatsApp"
              >
                WhatsApp
              </a>
            </div>
            <p className="mt-4 max-w-xl text-xs leading-6 text-[#8A7B70]">
              Conteúdos do site e do blog têm finalidade educativa e não substituem
              avaliação individual, diagnóstico ou prescrição nutricional.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:flex sm:justify-end">
            <div>
              <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-[#8C5F50]">
                Navegação
              </p>
              <ul className="space-y-2 text-sm text-[#75675E]">
                <li><Link href="/" className="transition-colors hover:text-[#607A56]">Início</Link></li>
                <li><Link href="/servicos" className="transition-colors hover:text-[#607A56]">Serviços</Link></li>
                <li><Link href="/como-funciona" className="transition-colors hover:text-[#607A56]">Como funciona</Link></li>
                <li><Link href="/blog" className="transition-colors hover:text-[#607A56]">Blog</Link></li>
                <li><Link href="/login" className="transition-colors hover:text-[#607A56]">Área restrita</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-[#8C5F50]">
                Começar
              </p>
              <Link
                href="/formulario"
                className="inline-flex items-center gap-2 rounded-full bg-[#7F9A74] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-[0_14px_30px_rgba(127,154,116,0.2)] transition hover:bg-[#607A56]"
              >
                Pré-consulta
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col justify-between gap-3 border-t border-[#E2D2C5] pt-6 text-xs text-[#9A8B80] sm:flex-row">
          <p>© {new Date().getFullYear()} Bruna Flores Nutri. Todos os direitos reservados.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacidade" className="transition hover:text-[#607A56]">Privacidade</Link>
            <Link href="/termos" className="transition hover:text-[#607A56]">Termos de uso</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
