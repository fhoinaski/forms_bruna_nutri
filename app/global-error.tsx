"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("global_render_error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#FBF7F1", color: "#3A3028", padding: 24 }}>
          <section style={{ width: "100%", maxWidth: 560, border: "1px solid #EDE1D6", borderRadius: 20, background: "#FFFDFC", padding: 32 }}>
            <p style={{ margin: 0, textTransform: "uppercase", letterSpacing: 1.8, fontSize: 12, color: "#8C5F50", fontWeight: 700 }}>Instabilidade</p>
            <h1 style={{ margin: "12px 0 0", fontSize: 34, lineHeight: 1.1 }}>Nao foi possivel abrir o site.</h1>
            <p style={{ margin: "16px 0 0", color: "#75675E", lineHeight: 1.7 }}>Atualize a pagina ou tente novamente em alguns instantes.</p>
            <button type="button" onClick={reset} style={{ marginTop: 24, border: 0, borderRadius: 999, background: "#7F9A74", color: "white", padding: "12px 18px", fontWeight: 700 }}>
              Tentar novamente
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
