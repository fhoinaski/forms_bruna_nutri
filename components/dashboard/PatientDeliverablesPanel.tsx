"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, FileUp, Printer, RotateCcw, Send, UploadCloud } from "lucide-react";

type Item = { id: string; snapshot_title?: string; original_filename?: string; status: string; published_at: string | null };

const statusLabel = (status: string) => ({ PUBLISHED: "Publicado", REVOKED: "Revogado" } as Record<string, string>)[status] ?? "Rascunho";

function StatusBadge({ status }: { status: string }) {
  const published = status === "PUBLISHED";
  const revoked = status === "REVOKED";
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${published ? "bg-[#EAF0E4] text-[#4F6847]" : revoked ? "bg-[#F4ECE7] text-[#75675E]" : "bg-[#FFF3D8] text-[#9A6B20]"}`}>{statusLabel(status)}</span>;
}

export function PatientDeliverablesPanel({ patientId }: { patientId: string }) {
  const [orientations, setOrientations] = useState<Item[]>([]);
  const [files, setFiles] = useState<Item[]>([]);
  const [cards, setCards] = useState<Array<{ id: string; title: string }>>([]);
  const [cardId, setCardId] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [orientationsResponse, filesResponse, cardsResponse] = await Promise.all([fetch(`/api/admin/clients/${patientId}/orientations`), fetch(`/api/admin/clients/${patientId}/files`), fetch("/api/admin/patient-education-cards")]);
    if (orientationsResponse.ok) setOrientations((await orientationsResponse.json()).items);
    if (filesResponse.ok) setFiles((await filesResponse.json()).items);
    if (cardsResponse.ok) setCards((await cardsResponse.json()).items);
  }, [patientId]);

  useEffect(() => { void load(); }, [load]);

  const update = async (url: string, body: unknown) => {
    const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setMessage(response.ok ? "Alteração salva no portal." : "Não foi possível concluir a alteração.");
    if (response.ok) await load();
  };
  const addOrientation = async () => {
    if (!cardId) return;
    const response = await fetch(`/api/admin/clients/${patientId}/orientations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ education_card_id: cardId }) });
    setMessage(response.ok ? "Orientação adicionada como rascunho. Publique quando revisar." : "Não foi possível adicionar a orientação.");
    if (response.ok) { setCardId(""); await load(); }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true); setSelectedFileName(file.name); setMessage("Enviando arquivo...");
    const form = new FormData(); form.set("file", file);
    const response = await fetch(`/api/admin/clients/${patientId}/files`, { method: "POST", body: form });
    setMessage(response.ok ? "Arquivo privado enviado como rascunho. Publique quando revisar." : "Não foi possível enviar o arquivo. Confira o tipo e o tamanho.");
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (response.ok) await load();
  };

  return (
    <section className="rounded-2xl border border-[#EDE1D6] bg-[#FFFDFC] p-4 shadow-[0_12px_30px_rgba(58,48,40,0.035)] sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="brand-kicker">Entregas do portal</p><h3 className="mt-1 font-serif text-lg font-semibold text-[#3A3028]">Orientações e arquivos</h3><p className="mt-1 text-sm text-[#75675E]">Prepare, revise e publique o que a paciente verá no portal.</p></div>
        <div className="flex flex-wrap items-center gap-2"><span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#F5FAF0] px-3 py-1.5 text-xs font-semibold text-[#607A56]"><CheckCircle2 className="h-3.5 w-3.5" /> Conteúdo privado</span><a href={`/dashboard/clients/${patientId}/print?secao=plano-alimentar`} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[#EAD8C2] bg-white px-3 text-xs font-semibold text-[#75675E] transition hover:bg-[#FBF7F1]"><Printer className="h-3.5 w-3.5" /> Prévia para imprimir</a></div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[#EDE1D6] bg-[#FAF7F2]/55 p-4">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#607A56]" /><h4 className="font-semibold text-[#3A3028]">Orientações</h4></div>
          <p className="mt-1 text-xs leading-5 text-[#75675E]">Escolha um conteúdo do catálogo e publique após revisar.</p>
          <label className="brand-label mt-4" htmlFor="portal-orientation">Adicionar orientação</label>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><select id="portal-orientation" value={cardId} onChange={(event) => setCardId(event.target.value)} className="brand-input"><option value="">Selecione do catálogo</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.title}</option>)}</select><button type="button" onClick={() => void addOrientation()} disabled={!cardId} className="brand-btn-secondary w-full sm:w-auto"><Send className="h-4 w-4" /> Adicionar</button></div>
          <div className="mt-4 space-y-2">{orientations.length === 0 ? <p className="rounded-lg border border-dashed border-[#D9C4B2] px-3 py-4 text-center text-xs text-[#75675E]">Nenhuma orientação preparada ainda.</p> : orientations.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 text-sm"><div className="min-w-0"><p className="truncate font-medium text-[#3A3028]">{item.snapshot_title}</p><StatusBadge status={item.status} /></div>{item.status !== "REVOKED" && <button type="button" className="shrink-0 text-xs font-semibold text-[#607A56] underline underline-offset-2" onClick={() => void update(`/api/admin/clients/${patientId}/orientations`, { id: item.id, status: item.status === "PUBLISHED" ? "REVOKED" : "PUBLISHED" })}>{item.status === "PUBLISHED" ? "Revogar" : "Publicar"}</button>}</div>)}</div>
        </section>

        <section className="rounded-xl border border-[#EDE1D6] bg-[#FAF7F2]/55 p-4">
          <div className="flex items-center gap-2"><FileUp className="h-4 w-4 text-[#607A56]" /><h4 className="font-semibold text-[#3A3028]">Arquivos</h4></div>
          <p className="mt-1 text-xs leading-5 text-[#75675E]">Envie PDFs ou imagens para a paciente consultar com segurança.</p>
          <input ref={fileInputRef} aria-label="Adicionar arquivo ao portal" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void upload(event.target.files?.[0])} />
          <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#B9C9B2] bg-[#F7FBF4] px-4 py-4 text-sm font-semibold text-[#4F6847] transition hover:border-[#7F9A74] hover:bg-[#EEF5E9] disabled:cursor-not-allowed disabled:opacity-60"><UploadCloud className="h-5 w-5" />{uploading ? "Enviando arquivo..." : "Selecionar arquivo"}</button>
          <p className="mt-2 text-center text-[11px] text-[#75675E]">PDF, JPG, PNG ou WEBP. O arquivo entra como rascunho.</p>{selectedFileName && <p className="mt-2 truncate text-center text-xs font-medium text-[#607A56]">{selectedFileName}</p>}
          <div className="mt-4 space-y-2">{files.length === 0 ? <p className="rounded-lg border border-dashed border-[#D9C4B2] px-3 py-4 text-center text-xs text-[#75675E]">Nenhum arquivo enviado ainda.</p> : files.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 text-sm"><div className="min-w-0"><p className="truncate font-medium text-[#3A3028]">{item.original_filename}</p><StatusBadge status={item.status} /></div>{item.status !== "REVOKED" && <button type="button" className="shrink-0 text-xs font-semibold text-[#607A56] underline underline-offset-2" onClick={() => void update(`/api/admin/clients/${patientId}/files`, { id: item.id, status: item.status === "PUBLISHED" ? "REVOKED" : "PUBLISHED" })}>{item.status === "PUBLISHED" ? <><RotateCcw className="mr-1 inline h-3 w-3" />Revogar</> : "Publicar"}</button>}</div>)}</div>
        </section>
      </div>
      {message && <p className="mt-4 rounded-lg border border-[#D9E4D3] bg-[#F5FAF0] px-3 py-2.5 text-sm text-[#607A56]" role="status">{message}</p>}
    </section>
  );
}
