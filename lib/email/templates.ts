function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textToHtml(value: string) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

export function formatPtDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function brandedEmailLayout({
  title,
  preview,
  body,
}: {
  title: string;
  preview?: string;
  body: string;
}) {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#FBF7F1;color:#3A3028;font-family:Arial,Helvetica,sans-serif;">
    ${preview ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>` : ""}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FBF7F1;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#FFFDFC;border:1px solid #EDE1D6;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;border-bottom:1px solid #EDE1D6;">
                <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7F9A74;font-weight:700;">Bruna Flores Nutri</div>
                <h1 style="margin:8px 0 0;font-size:28px;line-height:1.15;color:#3A3028;font-family:Georgia,'Times New Roman',serif;font-weight:600;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;color:#3A3028;font-size:15px;line-height:1.65;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#F4F8F1;color:#607A56;font-size:12px;line-height:1.5;">
                Este e-mail traz apenas informações administrativas do atendimento. Se tiver dúvidas, responda este contato.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function appointmentReminderEmail(input: {
  message: string;
  appointmentTitle: string;
  startsAt: string;
  location?: string | null;
}) {
  const when = formatPtDateTime(input.startsAt);
  const body = `
    <p style="margin:0 0 18px;">${textToHtml(input.message)}</p>
    <div style="margin:22px 0;padding:16px;border:1px solid #D9E4D3;border-radius:14px;background:#F4F8F1;">
      <p style="margin:0 0 6px;"><strong>Consulta:</strong> ${escapeHtml(input.appointmentTitle)}</p>
      <p style="margin:0 0 6px;"><strong>Data e hora:</strong> ${escapeHtml(when)}</p>
      ${input.location ? `<p style="margin:0;"><strong>Local/link:</strong> ${escapeHtml(input.location)}</p>` : ""}
    </div>
  `;

  return brandedEmailLayout({
    title: "Lembrete de atendimento",
    preview: `Atendimento em ${when}`,
    body,
  });
}

export function portalAccessEmail(input: {
  clientName: string;
  code: string;
  loginUrl: string;
}) {
  const body = `
    <p style="margin:0 0 18px;">Olá, ${escapeHtml(input.clientName.split(" ")[0] || input.clientName)}.</p>
    <p style="margin:0 0 18px;">Seu acesso ao portal da Bruna Flores Nutri foi liberado.</p>
    <div style="margin:22px 0;padding:18px;border:1px solid #D9E4D3;border-radius:14px;background:#F4F8F1;text-align:center;">
      <p style="margin:0 0 8px;color:#607A56;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;font-weight:700;">Código de acesso</p>
      <p style="margin:0;font-size:28px;letter-spacing:0.08em;font-weight:700;color:#3A3028;">${escapeHtml(input.code)}</p>
    </div>
    <p style="margin:0 0 18px;">Acesse: <a href="${escapeHtml(input.loginUrl)}" style="color:#607A56;font-weight:700;">${escapeHtml(input.loginUrl)}</a></p>
  `;

  return brandedEmailLayout({
    title: "Acesso ao portal",
    preview: "Seu código de acesso ao portal foi liberado.",
    body,
  });
}

export function overduePaymentEmail(input: {
  clientName: string;
  description: string;
  amountCents: number;
  dueDate: string;
  paymentLink?: string | null;
}) {
  const amount = formatMoney(input.amountCents);
  const dueDate = new Date(input.dueDate).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const body = `
    <p style="margin:0 0 18px;">Olá, ${escapeHtml(input.clientName.split(" ")[0] || input.clientName)}.</p>
    <p style="margin:0 0 18px;">Identificamos um pagamento em aberto no sistema.</p>
    <div style="margin:22px 0;padding:16px;border:1px solid #D9E4D3;border-radius:14px;background:#F4F8F1;">
      <p style="margin:0 0 6px;"><strong>Descrição:</strong> ${escapeHtml(input.description)}</p>
      <p style="margin:0 0 6px;"><strong>Valor:</strong> ${escapeHtml(amount)}</p>
      <p style="margin:0;"><strong>Vencimento:</strong> ${escapeHtml(dueDate)}</p>
    </div>
    ${input.paymentLink ? `<p style="margin:0 0 18px;">Link de pagamento: <a href="${escapeHtml(input.paymentLink)}" style="color:#607A56;font-weight:700;">acessar pagamento</a></p>` : ""}
  `;

  return brandedEmailLayout({
    title: "Pagamento em aberto",
    preview: `Pagamento de ${amount} vencido em ${dueDate}`,
    body,
  });
}
