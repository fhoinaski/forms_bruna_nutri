"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Calendar } from "lucide-react";
import { format, parseISO, startOfMonth } from "date-fns";

export default function DashboardPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/respostas")
      .then(res => res.json())
      .then(res => {
        setData(res.data || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-20 text-[#8C6E52]">Carregando...</div>;
  }

  const total = data.length;
  const currentMonthStart = startOfMonth(new Date());
  const thisMonth = data.filter(d => new Date(d.createdAt) >= currentMonthStart).length;

  return (
    <div className="space-y-8 flex flex-col h-full max-w-6xl mx-auto">
      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 shrink-0">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#EAD8C2] flex justify-between items-end">
          <div>
            <p className="text-xs font-bold text-[#B47F6A] uppercase tracking-wider mb-1">Total de Respostas</p>
            <h3 className="text-4xl font-serif font-bold text-[#7A9A74]">{total}</h3>
          </div>
          <div className="w-10 h-10 bg-[#7A9A74]/20 rounded-full flex items-center justify-center">
            <Users className="w-5 h-5 text-[#7A9A74]" />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#EAD8C2] flex justify-between items-end">
          <div>
            <p className="text-xs font-bold text-[#B47F6A] uppercase tracking-wider mb-1">Este Mês</p>
            <h3 className="text-4xl font-serif font-bold text-[#B47F6A]">{thisMonth}</h3>
          </div>
          <div className="w-10 h-10 bg-[#F4C9C6]/50 rounded-full flex items-center justify-center">
             <Calendar className="w-5 h-5 text-[#B47F6A]" />
          </div>
        </div>
      </div>

      {/* Recent Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-[#EAD8C2] flex flex-col flex-1 overflow-hidden min-h-[400px]">
        <div className="p-6 border-b border-[#EAD8C2] flex justify-between items-center shrink-0">
          <h4 className="font-serif font-bold text-lg text-[#B47F6A]">Respostas Recentes</h4>
          <span className="text-xs text-[#7A9A74] font-medium border border-[#7A9A74] px-3 py-1 rounded-full hidden sm:block">Atualizado</span>
        </div>
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full text-left">
            <thead className="bg-[#FAF7F2] text-[#B47F6A] text-[11px] uppercase tracking-widest sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 md:px-8 py-4">Paciente</th>
                <th className="px-4 py-4">WhatsApp</th>
                <th className="px-4 py-4">Objetivo</th>
                <th className="px-4 py-4 text-center">Data</th>
                <th className="px-6 md:px-8 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {data.map((row) => (
                <tr key={row.id} className="border-b border-[#FAF7F2] hover:bg-[#FAF7F2]/30 transition-colors">
                  <td className="px-6 md:px-8 py-4 font-medium text-gray-800 whitespace-nowrap">
                    {row.nome}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {row.whatsapp}
                  </td>
                  <td className="px-4 py-4 italic text-[#7A9A74] whitespace-nowrap">
                    {row.objetivo || "Não informado"}
                  </td>
                  <td className="px-4 py-4 text-center whitespace-nowrap">
                    {format(parseISO(row.createdAt), "dd/MM/yyyy")}
                  </td>
                  <td className="px-6 md:px-8 py-4 text-right space-x-2 whitespace-nowrap">
                    <Link href={`/dashboard/respostas/${row.id}`} className="text-[#B47F6A] hover:underline px-2 inline-block">
                      Ver
                    </Link>
                    <a href={`/dashboard/respostas/${row.id}/pdf`} target="_blank" className="bg-[#F4C9C6] text-[#B47F6A] text-xs font-bold px-3 py-1 rounded-lg hover:bg-[#f1b8b4] transition-colors inline-block">
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[#A8927D]">
                    Nenhuma resposta recebida ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
