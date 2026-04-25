"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (data.mustChangePassword) {
          router.push("/dashboard/settings/security");
        } else {
          router.push("/dashboard");
        }
        router.refresh();
      } else {
        setError(data.message || "E-mail ou senha inválidos.");
      }
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] font-sans antialiased text-[#3A2B1F]">
      <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-[#E8D9C8]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-[#EAD8C2] rounded-full flex items-center justify-center mb-4 text-[#7A9A74]">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-serif text-[#8C6E52]">Acesso Restrito</h1>
          <p className="text-xs text-[#A8927D] mt-1">Bruna Flores Nutri — Painel Admin</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#7A6050] tracking-wider uppercase mb-2">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
              className="w-full bg-[#FAF6F1] border border-[#E8D9C8] rounded-xl px-4 py-3 text-[#3A2B1F] placeholder-[#A8927D] focus:outline-none focus:border-[#7A9A74] focus:ring-1 focus:ring-[#7A9A74] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#7A6050] tracking-wider uppercase mb-2">
              Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                required
                autoComplete="current-password"
                className="w-full bg-[#FAF6F1] border border-[#E8D9C8] rounded-xl px-4 py-3 pr-11 text-[#3A2B1F] placeholder-[#A8927D] focus:outline-none focus:border-[#7A9A74] focus:ring-1 focus:ring-[#7A9A74] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A8927D] hover:text-[#7A6050] transition-colors"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-red-600 text-sm text-center">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full font-sans font-medium text-sm tracking-widest uppercase text-white bg-[#7A9A74] hover:bg-[#688a62] transition-colors rounded-xl px-6 py-3 disabled:opacity-70 disabled:cursor-not-allowed mt-2 shadow-sm"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
