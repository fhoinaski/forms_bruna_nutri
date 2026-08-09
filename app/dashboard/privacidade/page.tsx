"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Archive,
  Clock3,
  Download,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { HelpPopover } from "@/components/dashboard/HelpPopover";

type PrivacyRequest = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  request_type: string;
  details: string | null;
  status: string;
  verification_status: string;
  admin_notes: string | null;
  created_at: string;
};

type AuditLog = {
  id: string;
  action: string;
  outcome: string;
  entity_type: string | null;
  created_at: string;
};

type PrivacyData = {
  requests: PrivacyRequest[];
  auditLogs: AuditLog[];
  settings: { retention_months: number };
  retentionPreview: { cutoff: string; submissions: number; clients: number };
};

const requestLabels: Record<string, string> = {
  acesso: "Acesso",
  correcao: "Correção",
  exclusao: "Exclusão",
  revogacao: "Revogação",
  informacao: "Informação",
  outro: "Outro",
};

const actionLabels: Record<string, string> = {
  login_success: "Acesso realizado",
  login_failed: "Tentativa de acesso recusada",
  logout: "Sessão encerrada",
  password_changed: "Senha alterada",
  mfa_enabled: "MFA ativado",
  mfa_disabled: "MFA desativado",
  privacy_request_updated: "Solicitação atualizada",
  data_anonymized: "Dados anonimizados",
  data_subject_exported: "Dados do titular exportados",
  sensitive_data_exported: "Dados clínicos exportados",
  retention_policy_updated: "Retenção atualizada",
  appointment_workflow_created: "Roteiro de atendimento criado",
  appointment_workflow_updated: "Ação de atendimento atualizada",
  lead_opportunities_backfilled: "Oportunidades sincronizadas",
  lead_opportunity_updated: "Oportunidade atualizada",
  admin_mutation_requested: "Alteração administrativa solicitada",
};

async function readResponseMessage(response: Response) {
  const text = await response.text();
  if (!text) return response.ok ? "Ação concluída." : "Não foi possível concluir a ação.";

  try {
    const json = JSON.parse(text) as { message?: string };
    return json.message ?? (response.ok ? "Ação concluída." : "Não foi possível concluir a ação.");
  } catch {
    return response.ok ? "Ação concluída." : text.slice(0, 180);
  }
}

export default function PrivacyDashboardPage() {
  const [data, setData] = useState<PrivacyData | null>(null);
  const [retentionMonths, setRetentionMonths] = useState(60);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/privacy", { cache: "no-store" });
    if (!response.ok) {
      setMessage(await readResponseMessage(response));
      return;
    }
    const value = await response.json() as PrivacyData;
    setData(value);
    setRetentionMonths(value.settings?.retention_months ?? 60);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateRequest(id: string, patch: Record<string, unknown>) {
    setActionLoading(id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/privacy/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        setMessage(await readResponseMessage(response));
        return;
      }

      setMessage("Solicitação atualizada.");
      await load();
    } catch {
      setMessage("Não foi possível atualizar a solicitação. Verifique a conexão e tente novamente.");
    } finally {
      setActionLoading(null);
    }
  }

  async function exportData(item: PrivacyRequest) {
    setActionLoading(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/privacy/${item.id}/export`, { cache: "no-store" });
      if (!response.ok) {
        setMessage(await readResponseMessage(response));
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dados-titular-${item.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage("Exportação iniciada.");
      await load();
    } catch {
      setMessage("Não foi possível exportar os dados. Verifique a conexão e tente novamente.");
    } finally {
      setActionLoading(null);
    }
  }

  async function anonymize(item: PrivacyRequest) {
    const confirmed = window.confirm(
      "Esta ação remove ou anonimiza dados clínicos associados e não pode ser desfeita. Deseja continuar?"
    );
    if (!confirmed) return;

    setActionLoading(item.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/privacy/${item.id}/anonymize`, { method: "POST" });
      const text = await response.text();
      const result = text ? JSON.parse(text) as { message?: string; clients?: number; submissions?: number } : {};

      if (!response.ok) {
        setMessage(result.message ?? "Não foi possível anonimizar os dados.");
        return;
      }

      setMessage(`Anonimização concluída: ${result.clients ?? 0} cliente(s) e ${result.submissions ?? 0} pré-consulta(s).`);
      await load();
    } catch {
      setMessage("Não foi possível anonimizar os dados. Verifique a conexão e tente novamente.");
    } finally {
      setActionLoading(null);
    }
  }

  async function saveRetention() {
    setActionLoading("retention");
    setMessage("");
    try {
      const response = await fetch("/api/admin/privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionMonths }),
      });

      if (!response.ok) {
        setMessage(await readResponseMessage(response));
        return;
      }

      setMessage("Política de retenção atualizada.");
      await load();
    } catch {
      setMessage("Não foi possível salvar a política de retenção.");
    } finally {
      setActionLoading(null);
    }
  }

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[#607A56]">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const open = data.requests.filter((item) => !["concluida", "recusada"].includes(item.status)).length;

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="brand-kicker mb-2">Governança de dados</p>
          <div className="flex items-start gap-3">
            <h1 className="font-serif text-4xl font-semibold">Privacidade e segurança</h1>
            <HelpPopover topicKey="privacidade" />
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#75675E]">
            Solicitações dos titulares, retenção, anonimização e histórico das ações sensíveis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[#D9E4D3] px-4 text-sm font-semibold text-[#607A56]"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </header>

      {message && (
        <div className="rounded-lg border border-[#D9E4D3] bg-[#F4F8F1] px-4 py-3 text-sm text-[#4F6847]">
          {message}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Clock3 />} label="Solicitações abertas" value={open} />
        <Metric
          icon={<UserCheck />}
          label="Identidades verificadas"
          value={data.requests.filter((item) => item.verification_status === "verificada").length}
        />
        <Metric icon={<Activity />} label="Eventos auditados" value={data.auditLogs.length} />
      </section>

      <section className="grid gap-7 xl:grid-cols-[1.45fr_0.75fr]">
        <div className="brand-card overflow-hidden">
          <div className="border-b border-[#EDE1D6] p-6">
            <h2 className="font-serif text-2xl font-semibold">Solicitações de direitos</h2>
            <p className="mt-2 text-xs text-[#8A7B70]">
              Verifique a identidade por um canal já cadastrado, nunca apenas pelos dados enviados neste pedido.
            </p>
          </div>
          <div className="divide-y divide-[#EDE1D6]">
            {data.requests.length === 0 ? (
              <p className="p-8 text-sm text-[#8A7B70]">Nenhuma solicitação recebida.</p>
            ) : (
              data.requests.map((item) => (
                <PrivacyRequestCard
                  key={item.id}
                  item={item}
                  loading={actionLoading === item.id}
                  onUpdate={updateRequest}
                  onExport={exportData}
                  onAnonymize={anonymize}
                />
              ))
            )}
          </div>
        </div>

        <aside className="space-y-7">
          <div className="brand-card p-6">
            <div className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-[#607A56]" />
              <h2 className="font-serif text-xl font-semibold">Retenção</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#75675E]">
              Registros encerrados e inativos anteriores ao prazo entram na revisão de descarte. A exclusão nunca é automática.
            </p>
            <label className="brand-label mt-5 block">Período de revisão</label>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                min={12}
                max={240}
                value={retentionMonths}
                onChange={(event) => setRetentionMonths(Number(event.target.value))}
                className="brand-input"
              />
              <button
                type="button"
                onClick={saveRetention}
                disabled={actionLoading === "retention"}
                className="brand-btn-primary"
              >
                Salvar
              </button>
            </div>
            <div className="mt-4 rounded-lg bg-[#FBF7F1] p-4 text-sm text-[#75675E]">
              <p>Antes de {new Date(data.retentionPreview.cutoff).toLocaleDateString("pt-BR")}:</p>
              <p className="mt-1 font-semibold">
                {data.retentionPreview.submissions} pré-consulta(s) e {data.retentionPreview.clients} cliente(s) para revisão.
              </p>
            </div>
          </div>

          <div className="brand-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[#EDE1D6] p-5">
              <ShieldCheck className="h-5 w-5 text-[#607A56]" />
              <h2 className="font-serif text-xl font-semibold">Auditoria recente</h2>
            </div>
            <div className="max-h-[420px] divide-y divide-[#EDE1D6] overflow-y-auto">
              {data.auditLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-4">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${log.outcome === "failure" ? "bg-red-400" : "bg-[#7F9A74]"}`} />
                  <div>
                    <p className="text-sm font-semibold">{actionLabels[log.action] ?? log.action.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs text-[#9A8B80]">{new Date(log.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function PrivacyRequestCard({
  item,
  loading,
  onUpdate,
  onExport,
  onAnonymize,
}: {
  item: PrivacyRequest;
  loading: boolean;
  onUpdate: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onExport: (item: PrivacyRequest) => Promise<void>;
  onAnonymize: (item: PrivacyRequest) => Promise<void>;
}) {
  return (
    <article className="p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{item.name}</h3>
            <span className="rounded-full bg-[#F5ECE4] px-2.5 py-1 text-xs text-[#8C5F50]">
              {requestLabels[item.request_type] ?? item.request_type}
            </span>
            <span className="rounded-full bg-[#EAF0E4] px-2.5 py-1 text-xs text-[#4F6847]">
              {item.status.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#75675E]">
            {item.email}
            {item.phone ? ` · ${item.phone}` : ""}
          </p>
          <p className="mt-2 text-xs text-[#9A8B80]">
            Recebida em {new Date(item.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
        <select
          value={item.verification_status}
          disabled={loading}
          onChange={(event) => void onUpdate(item.id, { verificationStatus: event.target.value })}
          className="brand-input h-10 sm:w-64"
        >
          <option value="pendente">Identidade pendente</option>
          <option value="verificada">Identidade verificada</option>
          <option value="nao_verificada">Não verificada</option>
        </select>
      </div>

      {item.details && (
        <p className="mt-4 rounded-lg bg-[#FBF7F1] p-4 text-sm leading-6 text-[#5F554D]">
          {item.details}
        </p>
      )}
      {item.admin_notes && (
        <p className="mt-3 text-xs leading-5 text-[#8A7B70]">Nota interna: {item.admin_notes}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton disabled={loading} onClick={() => void onUpdate(item.id, { status: "em_analise" })}>
          Em análise
        </ActionButton>
        <ActionButton
          disabled={loading}
          onClick={() => {
            const note = window.prompt("Nota interna sobre a decisão:", item.admin_notes ?? "");
            if (note !== null) void onUpdate(item.id, { adminNotes: note });
          }}
        >
          Adicionar nota
        </ActionButton>
        <ActionButton
          disabled={loading || item.verification_status !== "verificada"}
          onClick={() => void onExport(item)}
        >
          <Download className="h-3.5 w-3.5" />
          Exportar dados
        </ActionButton>
        <ActionButton disabled={loading} onClick={() => void onUpdate(item.id, { status: "concluida" })}>
          Concluir
        </ActionButton>
        {["exclusao", "revogacao"].includes(item.request_type) && (
          <button
            type="button"
            disabled={loading || item.verification_status !== "verificada"}
            onClick={() => void onAnonymize(item)}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anonimizar dados
          </button>
        )}
      </div>
    </article>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#D9E4D3] px-4 py-2 text-xs font-semibold text-[#607A56] transition hover:bg-[#EAF0E4] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="brand-card flex items-center gap-4 p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#EAF0E4] text-[#607A56] [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-[#8A7B70]">{label}</p>
      </div>
    </div>
  );
}
