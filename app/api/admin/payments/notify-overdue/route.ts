import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/client";
import { overduePaymentEmail } from "@/lib/email/templates";
import {
  claimOverduePaymentNotification,
  getUnnotifiedOverduePayments,
  resetOverduePaymentNotification,
} from "@/lib/repositories/payments";
import { writeAuditLog } from "@/lib/security/audit";
import { verifyCronSecret } from "@/lib/security/cron";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const payments = await getUnnotifiedOverduePayments();
  let sent = 0;
  let skipped = 0;
  const errors: Array<{ id: string; message: string }> = [];
  const ipHash = getRequestFingerprint(req).ipHash;

  for (const payment of payments) {
    if (!payment.client_email || !payment.due_date) {
      skipped += 1;
      continue;
    }

    const claimed = await claimOverduePaymentNotification(payment.id);
    if (!claimed) {
      skipped += 1;
      continue;
    }

    try {
      await sendEmail({
        to: payment.client_email,
        subject: "Pagamento em aberto - Bruna Flores Nutri",
        text: `O pagamento "${payment.description}" no valor de ${payment.amount_cents / 100} venceu em ${payment.due_date}.`,
        html: overduePaymentEmail({
          clientName: payment.client_name ?? "Paciente",
          description: payment.description,
          amountCents: payment.amount_cents,
          dueDate: payment.due_date,
          paymentLink: payment.payment_link,
        }),
      });

      await writeAuditLog({
        action: "email_sent",
        entityType: "payment",
        entityId: payment.id,
        ipHash,
        metadata: {
          channel: "email",
          reason: "overdue_payment",
        },
      });
      sent += 1;
    } catch (error) {
      await resetOverduePaymentNotification(payment.id);
      errors.push({
        id: payment.id,
        message: error instanceof Error ? error.message : "Falha ao enviar e-mail.",
      });
    }
  }

  return NextResponse.json({
    processed: payments.length,
    sent,
    skipped,
    errors,
  });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
