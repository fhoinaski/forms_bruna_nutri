"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

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
    <div className="min-h-screen flex bg-[#FAF7F2] font-sans antialiased text-[#3A2B1F]">
      {/* Left panel — decorative (desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 bg-[#EAD8C2] flex-col items-center justify-center p-16 relative overflow-hidden">
        {/* Background botanical shapes */}
        <div className="absolute inset-0 pointer-events-none">
          <svg
            viewBox="0 0 600 700"
            fill="none"
            className="w-full h-full opacity-20"
            preserveAspectRatio="xMidYMid slice"
          >
            <ellipse cx="300" cy="350" rx="280" ry="320" stroke="#7A9A74" strokeWidth="1" />
            <ellipse cx="300" cy="350" rx="200" ry="230" stroke="#B47F6A" strokeWidth="0.5" />
            <path d="M80 600 Q300 100 520 600" stroke="#7A9A74" strokeWidth="1" fill="none" />
            <circle cx="300" cy="160" r="8" fill="#F4C9C6" />
            <circle cx="120" cy="500" r="5" fill="#F4C9C6" />
            <circle cx="480" cy="500" r="5" fill="#F4C9C6" />
          </svg>
        </div>

        <div className="relative z-10 text-center max-w-sm">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-md border-2 border-[#7A9A74]/30">
            <span className="font-serif italic text-3xl text-[#7A9A74]">BF</span>
          </div>
          <h1 className="font-serif text-4xl font-semibold text-[#B47F6A] mb-3 leading-tight">
            Bruna Flores Nutri
          </h1>
          <p className="text-[#8C6E52] text-sm leading-relaxed">
            Plataforma de gestão de formulários para nutrição materna.
          </p>
          <div className="mt-10 flex flex-col gap-3 text-xs text-[#A8927D]">
            <div className="flex items-center gap-3 justify-center">
              <span className="w-1.5 h-1.5 bg-[#7A9A74] rounded-full" />
              Formulários pré-consulta organizados
            </div>
            <div className="flex items-center gap-3 justify-center">
              <span className="w-1.5 h-1.5 bg-[#7A9A74] rounded-full" />
              Exportação em CSV e Excel
            </div>
            <div className="flex items-center gap-3 justify-center">
              <span className="w-1.5 h-1.5 bg-[#7A9A74] rounded-full" />
              Impressão e geração de PDF
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-fade-up">
          {/* Mobile brand */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="w-14 h-14 bg-[#EAD8C2] rounded-full flex items-center justify-center mb-3">
              <span className="font-serif italic text-xl text-[#7A9A74]">BF</span>
            </div>
            <p className="font-serif text-[#B47F6A] text-xl">Bruna Flores Nutri</p>
          </div>

          <div className="mb-8">
            <h2 className="font-serif text-2xl font-semibold text-[#3A2B1F] mb-1">
              Bem-vinda de volta
            </h2>
            <p className="text-sm text-[#A8927D]">Acesse o painel administrativo</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="brand-label">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
                className="brand-input"
              />
            </div>

            <div>
              <label className="brand-label">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha"
                  required
                  autoComplete="current-password"
                  className="brand-input pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A8927D] hover:text-[#8C6E52] transition-colors"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="brand-btn-primary w-full mt-2"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p className="mt-8 text-center text-[10px] text-[#C4A99A] tracking-widest uppercase">
            Área restrita — Bruna Flores Nutri © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
