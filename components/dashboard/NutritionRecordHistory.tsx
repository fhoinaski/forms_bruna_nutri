"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { ANAMNESIS_FIELD_LABELS, type AnamnesisFieldKey } from "@/lib/clinical/patient-anamnesis";

interface VersionMeta {
  id: string;
  version: number;
  changed_by_admin_id: string | null;
  changed_by_name: string | null;
  source: string;
  reason: string | null;
  created_at: string;
}

interface VersionDetail extends VersionMeta {
  snapshot: Record<string, unknown>;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  consultation: "Consulta",
  ai_proposal: "IA (confirmada)",
  pre_consultation: "Pré-consulta",
  import: "Importação",
  system: "Sistema",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NutritionRecordHistory({ clientId }: { clientId: string }) {
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [openVersion, setOpenVersion] = useState<VersionDetail | null>(null);

  async function load(cursor?: number) {
    const qs = cursor !== undefined ? `?limit=20&before=${cursor}` : "?limit=20";
    const res = await fetch(`/api/admin/clients/${clientId}/nutrition-record/versions${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error();
    return res.json() as Promise<{ items: VersionMeta[]; nextCursor: number | null }>;
  }

  useEffect(() => {
    load()
      .then((data) => {
        setVersions(data.items);
        setNextCursor(data.nextCursor);
      })
      .catch(() => setError("Não foi possível carregar o histórico."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function loadMore() {
    if (nextCursor === null) return;
    setLoadingMore(true);
    try {
      const data = await load(nextCursor);
      setVersions((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch {
      setError("Não foi possível carregar mais versões.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function open(version: number) {
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/nutrition-record/versions/${version}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setOpenVersion(await res.json());
    } catch {
      setError("Não foi possível abrir a versão.");
    }
  }

  if (loading) return <p className="text-sm text-[#A8927D]">Carregando histórico...</p>;

  return (
    <section className="rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] p-5">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-[#607A56]" />
        <h3 className="font-serif text-base font-semibold text-[#3A3028]">Histórico de alterações</h3>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {versions.length === 0 && !error && <p className="mt-3 text-sm text-[#A8927D]">Nenhuma versão registrada ainda.</p>}

      <ul className="mt-3 divide-y divide-[#F5ECE4]">
        {versions.map((v) => (
          <li key={v.id} className="py-3">
            <button type="button" onClick={() => open(v.version)} className="flex w-full items-start justify-between gap-3 text-left">
              <div>
                <p className="text-sm font-semibold text-[#3A3028]">Versão {v.version}</p>
                <p className="text-xs text-[#8A7B70]">{formatDate(v.created_at)}</p>
                <p className="text-xs text-[#A9978A]">
                  {v.changed_by_name ? `Por ${v.changed_by_name}` : "Sistema"} · Origem: {SOURCE_LABELS[v.source] ?? v.source}
                </p>
                {v.reason && <p className="mt-1 text-xs italic text-[#8A7B70]">{v.reason}</p>}
              </div>
              <span className="shrink-0 text-xs font-semibold text-[#607A56] underline underline-offset-2">Ver</span>
            </button>
          </li>
        ))}
      </ul>

      {nextCursor !== null && (
        <button type="button" onClick={loadMore} disabled={loadingMore} className="mt-3 text-xs font-semibold text-[#607A56] underline underline-offset-2 disabled:opacity-50">
          {loadingMore ? "Carregando..." : "Carregar mais"}
        </button>
      )}

      {openVersion && <VersionModal version={openVersion} onClose={() => setOpenVersion(null)} />}
    </section>
  );
}

function VersionModal({ version, onClose }: { version: VersionDetail; onClose: () => void }) {
  const entries = Object.entries(version.snapshot).filter(([, value]) => value !== null && value !== "");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="font-serif text-lg font-semibold text-[#3A3028]">Versão {version.version} (somente leitura)</h4>
            <p className="text-xs text-[#8A7B70]">
              {formatDate(version.created_at)} · {version.changed_by_name ? `Por ${version.changed_by_name}` : "Sistema"} · {SOURCE_LABELS[version.source] ?? version.source}
            </p>
            {version.reason && <p className="mt-1 text-xs italic text-[#8A7B70]">Motivo: {version.reason}</p>}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-sm text-[#A9978A]">Fechar</button>
        </div>
        <dl className="mt-4 space-y-2">
          {entries.length === 0 && <p className="text-sm text-[#A8927D]">Sem dados clínicos nesta versão.</p>}
          {entries.map(([key, value]) => (
            <div key={key} className="border-b border-[#F5ECE4] pb-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[#A9978A]">
                {ANAMNESIS_FIELD_LABELS[key as AnamnesisFieldKey] ?? key}
              </dt>
              <dd className="whitespace-pre-wrap text-sm text-[#3A3028]">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
