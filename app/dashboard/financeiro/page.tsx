"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  Plus,
  ReceiptText,
  RefreshCw,
  Trash2,
  WalletCards,
} from "lucide-react";
import { HelpPopover } from "@/components/dashboard/HelpPopover";

type PaymentStatus = "pendente" | "pago" | "vencido" | "cancelado";
type PaymentMethod = "pix" | "cartao" | "dinheiro" | "transferencia" | "outro";

interface Client {
  id: string;
  name: string;
}

interface Payment {
  id: string;
  client_id: string | null;
  client_name: string | null;
  description: string;
  amount_cents: number;
  due_date: string | null;
  paid_at: string | null;
  status: PaymentStatus;
  payment_method: PaymentMethod | null;
  invoice_number: string | null;
  payment_link: string | null;
  receipt_url: string | null;
  installment_number: number | null;
  installment_total: number | null;
  category: string | null;
  notes: string | null;
}

interface FormState {
  client_id: string;
  description: string;
  amount: string;
  due_date: string;
  status: PaymentStatus;
  payment_method: PaymentMethod | "";
  invoice_number: string;
  payment_link: string;
  receipt_url: string;
  installment_number: string;
  installment_total: string;
  category: string;
  notes: string;
}

const statusLabels: Record<PaymentStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

const methodLabels: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao: "Cartao",
  dinheiro: "Dinheiro",
  transferencia: "Transferencia",
  outro: "Outro",
};

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function parseMoneyToCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

function statusTone(status: PaymentStatus) {
  if (status === "pago") return "bg-[#EAF0E4] text-[#607A56] border-[#C7D7BC]";
  if (status === "vencido") return "bg-[#F6E6E0] text-[#9A5C4E] border-[#E8C3BA]";
  if (status === "cancelado") return "bg-[#F3EEE9] text-[#8D8178] border-[#E1D6CD]";
  return "bg-[#FFF8E8] text-[#9A6B28] border-[#F3DFA8]";
}

export default function FinanceiroPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FormState>({
    client_id: "",
    description: "",
    amount: "",
    due_date: "",
    status: "pendente",
    payment_method: "pix",
    invoice_number: "",
    payment_link: "",
    receipt_url: "",
    installment_number: "",
    installment_total: "",
    category: "consulta",
    notes: "",
  });

  const summary = useMemo(() => {
    return payments.reduce(
      (acc, payment) => {
        if (payment.status === "pago") acc.received += payment.amount_cents;
        if (payment.status === "pendente" || payment.status === "vencido") {
          acc.open += payment.amount_cents;
        }
        if (payment.status === "vencido") acc.overdue += payment.amount_cents;
        return acc;
      },
      { received: 0, open: 0, overdue: 0 }
    );
  }, [payments]);

  async function loadFinanceiro() {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams(statusFilter ? { status: statusFilter } : {});
      const [paymentsRes, clientsRes] = await Promise.all([
        fetch(`/api/admin/payments?${params}`),
        fetch("/api/admin/clients?pageSize=100&status=ativo"),
      ]);
      if (!paymentsRes.ok || !clientsRes.ok) throw new Error();

      const paymentsJson: { items: Payment[] } = await paymentsRes.json();
      const clientsJson: { items: Client[] } = await clientsRes.json();
      setPayments(paymentsJson.items);
      setClients(clientsJson.items);
    } catch {
      setMessage("Nao foi possivel carregar o financeiro agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFinanceiro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createNewPayment(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const amountCents = parseMoneyToCents(form.amount);
      if (amountCents <= 0) {
        setMessage("Informe um valor valido para a cobranca.");
        return;
      }

      const status = form.status;
      const response = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: form.client_id || null,
          description: form.description,
          amount_cents: amountCents,
          due_date: form.due_date || null,
          paid_at: status === "pago" ? new Date().toISOString() : null,
          status,
          payment_method: form.payment_method || null,
          invoice_number: form.invoice_number || null,
          payment_link: form.payment_link || null,
          receipt_url: form.receipt_url || null,
          installment_number: form.installment_number ? Number(form.installment_number) : null,
          installment_total: form.installment_total ? Number(form.installment_total) : null,
          category: form.category || null,
          notes: form.notes || null,
        }),
      });

      if (!response.ok) throw new Error();
      setForm((current) => ({
        ...current,
        description: "",
        amount: "",
        due_date: "",
        invoice_number: "",
        payment_link: "",
        receipt_url: "",
        installment_number: "",
        installment_total: "",
        notes: "",
      }));
      setMessage("Cobranca registrada.");
      await loadFinanceiro();
    } catch {
      setMessage("Nao foi possivel registrar a cobranca.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: PaymentStatus) {
    setPayments((current) =>
      current.map((payment) =>
        payment.id === id
          ? {
              ...payment,
              status,
              paid_at: status === "pago" ? new Date().toISOString() : payment.paid_at,
            }
          : payment
      )
    );

    const response = await fetch(`/api/admin/payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        paid_at: status === "pago" ? new Date().toISOString() : null,
      }),
    });

    if (!response.ok) {
      setMessage("Nao foi possivel atualizar a cobranca.");
      await loadFinanceiro();
    }
  }

  async function removePayment(id: string) {
    const response = await fetch(`/api/admin/payments/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Nao foi possivel remover a cobranca.");
      return;
    }
    setPayments((current) => current.filter((payment) => payment.id !== id));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 animate-fade-up">
      <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="brand-kicker mb-3">Financeiro</p>
            <div className="flex items-start gap-3">
              <h1 className="font-serif text-4xl font-semibold leading-tight text-[#3A3028]">
                Gestao de cobrancas
              </h1>
              <HelpPopover topicKey="financeiro" />
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#75675E]">
              Acompanhe valores recebidos, pendencias e vencimentos ligados aos
              atendimentos, com uma leitura simples para a rotina do consultorio.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="brand-label">Status</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="brand-input min-w-[170px]"
              >
                <option value="">Todos</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void loadFinanceiro()}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-[#7F9A74]/35 px-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#607A56] transition hover:bg-[#EAF0E4]"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">Recebido</p>
            <CheckCircle2 className="h-5 w-5 text-[#607A56]" />
          </div>
          <p className="mt-3 font-serif text-3xl font-semibold text-[#3A3028]">
            {money(summary.received)}
          </p>
          <p className="mt-1 text-xs text-[#A9978A]">pagamentos marcados como pagos</p>
        </div>
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">Em aberto</p>
            <Clock className="h-5 w-5 text-[#9A6B28]" />
          </div>
          <p className="mt-3 font-serif text-3xl font-semibold text-[#3A3028]">
            {money(summary.open)}
          </p>
          <p className="mt-1 text-xs text-[#A9978A]">pendentes ou vencidos</p>
        </div>
        <div className="rounded-[1.25rem] border border-[#EDE1D6] bg-[#FFFDFC] p-5 shadow-[0_14px_35px_rgba(58,48,40,0.045)]">
          <div className="flex items-center justify-between">
            <p className="brand-kicker">Vencido</p>
            <WalletCards className="h-5 w-5 text-[#9A5C4E]" />
          </div>
          <p className="mt-3 font-serif text-3xl font-semibold text-[#3A3028]">
            {money(summary.overdue)}
          </p>
          <p className="mt-1 text-xs text-[#A9978A]">precisa de acompanhamento</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
          <div className="border-b border-[#EDE1D6] px-6 py-5">
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
              Cobrancas
            </h2>
            <p className="mt-1 text-sm text-[#75675E]">
              Controle objetivo dos pagamentos relacionados aos atendimentos.
            </p>
          </div>

          <div className="divide-y divide-[#F5ECE4]">
            {loading ? (
              <div className="px-6 py-16 text-center text-sm text-[#A9978A]">
                Carregando financeiro...
              </div>
            ) : payments.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <ReceiptText className="mx-auto mb-4 h-9 w-9 text-[#C4B3A6]" />
                <p className="font-serif text-xl font-semibold text-[#3A3028]">
                  Nenhuma cobranca registrada
                </p>
                <p className="mt-2 text-sm text-[#75675E]">
                  Use o formulario ao lado para registrar o primeiro valor.
                </p>
              </div>
            ) : (
              payments.map((payment) => (
                <article
                  key={payment.id}
                  className="grid gap-4 px-6 py-5 transition hover:bg-[#FBF7F1]/75 md:grid-cols-[minmax(0,1fr)_145px_190px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-[#3A3028]">{payment.description}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusTone(payment.status)}`}>
                        {statusLabels[payment.status]}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#75675E]">
                      {payment.client_name || "Paciente sem vinculo"}
                      {payment.due_date ? ` - vence em ${payment.due_date}` : ""}
                      {payment.category ? ` - ${payment.category}` : ""}
                      {payment.installment_number && payment.installment_total ? ` - parcela ${payment.installment_number}/${payment.installment_total}` : ""}
                    </p>
                    {(payment.invoice_number || payment.payment_link || payment.receipt_url) && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {payment.invoice_number && <span className="rounded-full bg-white px-3 py-1 font-semibold text-[#8C5F50]">NF {payment.invoice_number}</span>}
                        {payment.payment_link && <a href={payment.payment_link} target="_blank" rel="noreferrer" className="rounded-full bg-[#607A56] px-3 py-1 font-semibold text-white">Link de pagamento</a>}
                        {payment.receipt_url && <a href={payment.receipt_url} target="_blank" rel="noreferrer" className="rounded-full border border-[#D9E4D3] bg-white px-3 py-1 font-semibold text-[#607A56]">Recibo</a>}
                      </div>
                    )}
                    {payment.notes && (
                      <p className="mt-3 rounded-xl bg-[#FBF7F1] px-3 py-2 text-xs leading-5 text-[#75675E]">
                        {payment.notes}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="font-serif text-2xl font-semibold text-[#3A3028]">
                      {money(payment.amount_cents)}
                    </p>
                    <p className="mt-1 text-xs text-[#A9978A]">
                      {payment.payment_method
                        ? methodLabels[payment.payment_method]
                        : "Metodo nao informado"}
                    </p>
                  </div>

                  <div className="flex items-start gap-2 md:justify-end">
                    <select
                      value={payment.status}
                      onChange={(event) =>
                        void updateStatus(payment.id, event.target.value as PaymentStatus)
                      }
                      className="h-10 rounded-full border border-[#EDE1D6] bg-white px-3 text-xs font-semibold text-[#75675E] outline-none transition focus:border-[#7F9A74] focus:ring-2 focus:ring-[#7F9A74]/15"
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void removePayment(payment.id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E8C3BA] text-[#9A5C4E] transition hover:bg-[#F6E6E0]"
                      aria-label="Remover cobranca"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-[#EDE1D6] bg-[#FFFDFC] p-6 shadow-[0_18px_45px_rgba(58,48,40,0.055)]">
          <div className="mb-5">
            <p className="brand-kicker mb-2">Nova cobranca</p>
            <h2 className="font-serif text-2xl font-semibold text-[#3A3028]">
              Registrar valor
            </h2>
          </div>

          <form onSubmit={createNewPayment} className="space-y-4">
            <div>
              <label className="brand-label">Paciente</label>
              <select
                value={form.client_id}
                onChange={(event) => updateForm("client_id", event.target.value)}
                className="brand-input"
              >
                <option value="">Sem vinculo por enquanto</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="brand-label">Descricao</label>
              <input
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
                className="brand-input"
                placeholder="Ex: Consulta inicial, retorno, pacote mensal..."
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="brand-label">Valor</label>
                <div className="relative">
                  <Banknote className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A9978A]" />
                  <input
                    value={form.amount}
                    onChange={(event) => updateForm("amount", event.target.value)}
                    className="brand-input brand-input-with-icon"
                    placeholder="250,00"
                    inputMode="decimal"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="brand-label">Vencimento</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(event) => updateForm("due_date", event.target.value)}
                  className="brand-input"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="brand-label">Status</label>
                <select
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value as PaymentStatus)}
                  className="brand-input"
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="brand-label">Metodo</label>
                <select
                  value={form.payment_method}
                  onChange={(event) =>
                    updateForm("payment_method", event.target.value as PaymentMethod)
                  }
                  className="brand-input"
                >
                  {Object.entries(methodLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="brand-label">Categoria</label>
                <select value={form.category} onChange={(event) => updateForm("category", event.target.value)} className="brand-input">
                  <option value="consulta">Consulta</option>
                  <option value="retorno">Retorno</option>
                  <option value="pacote">Pacote</option>
                  <option value="material">Material</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="brand-label">Parcela</label>
                <input value={form.installment_number} onChange={(event) => updateForm("installment_number", event.target.value)} className="brand-input" placeholder="Ex: 1" inputMode="numeric" />
              </div>
              <div>
                <label className="brand-label">Total parcelas</label>
                <input value={form.installment_total} onChange={(event) => updateForm("installment_total", event.target.value)} className="brand-input" placeholder="Ex: 3" inputMode="numeric" />
              </div>
            </div>

            <div>
              <label className="brand-label">Nota fiscal / recibo interno</label>
              <input value={form.invoice_number} onChange={(event) => updateForm("invoice_number", event.target.value)} className="brand-input" placeholder="Ex: NF-2026-001" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="brand-label">Link de pagamento</label>
                <input value={form.payment_link} onChange={(event) => updateForm("payment_link", event.target.value)} className="brand-input" placeholder="https://..." />
              </div>
              <div>
                <label className="brand-label">URL do recibo</label>
                <input value={form.receipt_url} onChange={(event) => updateForm("receipt_url", event.target.value)} className="brand-input" placeholder="https://..." />
              </div>
            </div>

            <div>
              <label className="brand-label">Observacoes internas</label>
              <textarea
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                className="brand-input min-h-28 resize-none"
                placeholder="Combinados, parcelas, observacoes de pagamento."
              />
            </div>

            {message && (
              <p className="rounded-xl border border-[#EDE1D6] bg-[#FBF7F1] px-3 py-2 text-xs text-[#75675E]">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="brand-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {saving ? "Salvando..." : "Registrar cobranca"}
            </button>

            <div className="rounded-2xl border border-[#EDE1D6] bg-[#FBF7F1] p-4 text-xs leading-5 text-[#75675E]">
              <p className="mb-2 inline-flex items-center gap-2 font-semibold text-[#3A3028]">
                <CreditCard className="h-4 w-4 text-[#607A56]" />
                Uso recomendado
              </p>
              <p>
                Registre consultas, retornos e pacotes de acompanhamento para manter
                a rotina financeira alinhada ao cuidado clinico.
              </p>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
