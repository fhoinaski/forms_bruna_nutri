"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-6 py-2 bg-[#7A9A74] text-white rounded-full text-sm font-semibold hover:bg-[#688a62] transition-colors print:hidden"
    >
      Imprimir / Salvar PDF
    </button>
  );
}
