"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app_render_error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FBF7F1] px-5 text-[#3A3028]">
      <section className="w-full max-w-xl rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-8 shadow-[0_18px_45px_rgba(58,48,40,0.06)]">
        <p className="brand-kicker mb-3">Instabilidade</p>
        <h1 className="font-serif text-4xl font-semibold">Nao foi possivel carregar esta area.</h1>
        <p className="mt-4 text-sm leading-7 text-[#75675E]">
          Tente novamente. Se o problema continuar, a equipe consegue investigar pelo registro tecnico da falha.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={reset} className="brand-btn-primary px-6 py-3">
            Tentar novamente
          </button>
          <Link href="/" className="inline-flex items-center justify-center rounded-full border border-[#D8C8BB] px-6 py-3 text-xs font-semibold uppercase text-[#607A56]">
            Voltar ao inicio
          </Link>
        </div>
      </section>
    </main>
  );
}
