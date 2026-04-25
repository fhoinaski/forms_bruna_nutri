import { Jost, Cormorant_Garamond } from 'next/font/google';
import '../globals.css';
import Link from 'next/link';
import { LayoutDashboard, Download, LogOut } from 'lucide-react';

const jost = Jost({ 
  subsets: ['latin'],
  variable: '--font-sans',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${jost.variable} ${cormorant.variable} font-sans min-h-screen bg-[#FAF7F2] text-gray-800 flex overflow-hidden shadow-2xl`}>
      <aside className="w-64 bg-[#EAD8C2] h-full flex flex-col border-r border-[#B47F6A]/20 hidden lg:flex shrink-0 z-40">
        <div className="p-8 flex flex-col items-center">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border-2 border-[#7A9A74]">
            <span className="font-serif italic text-2xl text-[#7A9A74]">BF</span>
          </div>
          <h1 className="font-serif font-bold text-[#B47F6A] text-xl text-center leading-tight">Bruna Flores</h1>
          <p className="text-xs tracking-widest text-[#7A9A74] uppercase mt-1 text-center">Nutrição Materna</p>
        </div>

        <nav className="flex-1 px-4 mt-4 space-y-2">
          <Link href="/dashboard" className="flex items-center px-4 py-3 bg-[#FAF7F2] text-[#7A9A74] rounded-xl shadow-sm">
            <LayoutDashboard className="w-5 h-5 mr-3" />
            <span className="font-medium">Dashboard</span>
          </Link>
          <a href="/api/respostas/export" className="flex items-center px-4 py-3 text-[#B47F6A] hover:bg-[#FAF7F2]/50 rounded-xl transition-colors">
            <Download className="w-5 h-5 mr-3" />
            <span>Exportar CSV</span>
          </a>
          <form action="/api/logout" method="POST" className="block">
             <button className="w-full flex items-center px-4 py-3 text-[#B47F6A] hover:bg-[#FAF7F2]/50 rounded-xl transition-colors text-left">
               <LogOut className="w-5 h-5 mr-3" />
               <span>Sair</span>
             </button>
          </form>
        </nav>

        <div className="p-6">
          <div className="bg-[#F4C9C6]/30 p-4 rounded-2xl border border-[#F4C9C6]">
            <p className="text-[10px] text-[#B47F6A] font-bold uppercase tracking-wider">Sistema</p>
            <p className="text-[11px] text-[#7A9A74] mt-1 italic">Operacional</p>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="h-20 bg-white border-b border-[#EAD8C2] flex items-center justify-between px-6 lg:px-10 shrink-0">
          <h2 className="font-serif font-bold text-2xl text-[#7A9A74]">Painel Administrativo</h2>
          <div className="flex space-x-4">
            <Link href="/" className="px-6 py-2 bg-[#7A9A74] text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity hidden sm:block">
              Ver Formulário
            </Link>
            <div className="w-10 h-10 bg-[#F4C9C6] rounded-full border-2 border-white shadow-sm flex items-center justify-center">
              <span className="text-[#B47F6A] font-bold text-xs">BF</span>
            </div>
          </div>
        </header>

        <div className="p-6 lg:p-10 flex-1 overflow-auto relative z-10">
          {children}
        </div>
        
        <footer className="px-10 py-4 border-t border-[#EAD8C2] bg-white flex justify-between items-center text-[11px] text-[#B47F6A] uppercase tracking-widest shrink-0">
          <div className="flex items-center">
            <span className="w-2 h-2 bg-[#7A9A74] rounded-full mr-2"></span>
            Status do Sistema: Operacional
          </div>
          <div className="hidden sm:block">© {new Date().getFullYear()} Bruna Flores Nutri</div>
        </footer>

        {/* Decorative Botanical Elements */}
        <div className="fixed top-[-20px] right-[-20px] opacity-10 pointer-events-none z-0">
          <svg width="300" height="300" viewBox="0 0 100 100" fill="none">
            <path d="M10 90 Q 50 10 90 90" stroke="#7A9A74" strokeWidth="0.5" fill="none"/>
            <circle cx="50" cy="30" r="5" fill="#F4C9C6" opacity="0.5"/>
            <circle cx="20" cy="70" r="3" fill="#F4C9C6" opacity="0.5"/>
            <circle cx="80" cy="70" r="3" fill="#F4C9C6" opacity="0.5"/>
          </svg>
        </div>
      </main>
    </div>
  );
}
