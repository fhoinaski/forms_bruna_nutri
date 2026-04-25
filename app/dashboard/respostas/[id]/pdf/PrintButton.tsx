"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";

export default function PrintButton() {
  
  // Auto print when page loads
  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <button 
      onClick={() => window.print()}
      className="flex items-center gap-2 bg-[#B47F6A] text-white px-6 py-2.5 rounded-full text-sm font-semibold tracking-wider hover:bg-[#8C6E52] shadow-sm transition-all"
    >
      <Printer className="w-4 h-4" />
      Imprimir
    </button>
  );
}
