"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Clock } from "lucide-react";
import { calculateAgeInYears } from "@/lib/clinical/anthropometry";

export interface ConsultationHeaderClient {
  id: string;
  name: string;
  birth_date: string | null;
}

export interface ConsultationHeaderAlerts {
  allergies: string | null;
  restrictions: string | null;
  medications: string | null;
  diagnoses: string | null;
  risk_flags: string | null;
  biological_sex: string | null;
  target_group: string | null;
  gestationalApplicable: boolean;
  bariatricApplicable: boolean;
}

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h${String(minutes).padStart(2, "0")}min` : `${minutes} min`;
}

/**
 * Cabecalho da consulta (secao 3 do pedido) — informacao critica
 * identificavel rapidamente, NUNCA um prontuario completo. Alertas sao
 * 100% deterministicos (lidos direto de campos ja existentes do
 * prontuario/clinical-growth) — sem chamada de IA, sem latencia.
 */
export function ConsultationHeader({
  client,
  alerts,
  startedAt,
}: {
  client: ConsultationHeaderClient;
  alerts: ConsultationHeaderAlerts | null;
  startedAt: string;
}) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(startedAt));

  useEffect(() => {
    const interval = setInterval(() => setElapsed(formatElapsed(startedAt)), 30_000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const age = calculateAgeInYears(client.birth_date);
  const badges: string[] = [];
  if (alerts?.allergies?.trim()) badges.push(`Alergia: ${alerts.allergies.trim().slice(0, 60)}`);
  if (alerts?.restrictions?.trim()) badges.push(`Restrição: ${alerts.restrictions.trim().slice(0, 60)}`);
  if (alerts?.medications?.trim()) badges.push(`Medicação: ${alerts.medications.trim().slice(0, 60)}`);
  if (alerts?.risk_flags?.trim()) badges.push(`Atenção: ${alerts.risk_flags.trim().slice(0, 60)}`);
  if (alerts?.gestationalApplicable) badges.push("Gestante");
  if (alerts?.bariatricApplicable) badges.push("Pós-bariátrica");

  return (
    <div className="rounded-2xl border border-[#EDE1D6] bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/dashboard/clients/${client.id}`} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-[#75675E] hover:text-[#3A3028]">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para a ficha
          </Link>
          <h1 className="font-serif text-2xl font-semibold text-[#3A3028]">{client.name}</h1>
          <p className="mt-1 text-sm text-[#75675E]">
            {age !== null ? `${age} anos` : "Idade não informada"}
            {alerts?.biological_sex ? ` · ${alerts.biological_sex}` : ""}
            {alerts?.target_group ? ` · ${alerts.target_group}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#D9E4D3] bg-[#EEF3EA] px-3 py-1.5 text-xs font-semibold text-[#4F6847]">
          <Clock className="h-3.5 w-3.5" /> Consulta em andamento · {elapsed}
        </div>
      </div>

      {badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {badges.map((badge, index) => (
            <span key={index} className="inline-flex items-center gap-1 rounded-full bg-[#FBEAE4] px-2.5 py-1 text-[11px] font-semibold text-[#9A4B32]">
              <AlertTriangle className="h-3 w-3" /> {badge}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
