"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Erro no login");
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] font-sans antialiased text-[#3A2B1F]">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-[#E8D9C8]">
        <div className="w-12 h-12 bg-[#EAD8C2] rounded-full flex items-center justify-center mx-auto mb-6 text-[#7A9A74]">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-serif text-center text-[#8C6E52] mb-6">Acesso Restrito</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#7A6050] tracking-wider uppercase mb-2">Senha Admin</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              className="w-full bg-[#FAF6F1] border border-[#E8D9C8] rounded-xl px-4 py-3 text-[#3A2B1F] placeholder-[#A8927D] focus:outline-none focus:border-[#7A9A74] focus:ring-1 focus:ring-[#7A9A74] transition-all"
            />
          </div>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full font-sans font-medium text-sm tracking-widest uppercase text-white bg-[#7A9A74] hover:bg-[#688a62] transition-colors rounded-xl px-6 py-3 disabled:opacity-70 disabled:cursor-not-allowed mt-4 shadow-sm"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
