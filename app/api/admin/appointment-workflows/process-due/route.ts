import { NextRequest, NextResponse } from "next/server";
import {
  claimPendingAppointmentWorkflowItem,
  listAppointmentWorkflowItems,
  resetAppointmentWorkflowItemToPending,
  updateAppointmentWorkflowItem,
  workflowStepLabel,
} from "@/lib/repositories/appointment-workflows";
import { sendEmail } from "@/lib/email/client";
import { appointmentReminderEmail } from "@/lib/email/templates";
import { writeAuditLog } from "@/lib/security/audit";
import { verifyCronSecret } from "@/lib/security/cron";
import { getRequestFingerprint } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ message: "Nao autorizado." }, { status: 401 });
  }

  const now = new Date().toISOString();
  const dueItems = await listAppointmentWorkflowItems({
    to: now,
    status: "pendente",
    channel: "email",
  });

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ id: string; message: string }> = [];
  const ipHash = getRequestFingerprint(req).ipHash;

  for (const item of dueItems) {
    if (!item.client_email) {
      skipped += 1;
      continue;
    }

    const claimed = await claimPendingAppointmentWorkflowItem(item.id);
    if (!claimed) {
      skipped += 1;
      continue;
    }

    try {
      const subject = `${workflowStepLabel(item.step_type)} - Bruna Flores Nutri`;
      await sendEmail({
        to: item.client_email,
        subject,
        text: item.message,
        html: appointmentReminderEmail({
          message: item.message,
          appointmentTitle: item.appointment_title,
          startsAt: item.starts_at,
          location: item.location,
        }),
      });

      await updateAppointmentWorkflowItem(item.id, { status: "enviado" });
      await writeAuditLog({
        action: "email_sent",
        entityType: "appointment_workflow_item",
        entityId: item.id,
        ipHash,
        metadata: {
          channel: "email",
          appointmentId: item.appointment_id,
          stepType: item.step_type,
        },
      });
      sent += 1;
    } catch (error) {
      await resetAppointmentWorkflowItemToPending(item.id);
      errors.push({
        id: item.id,
        message: error instanceof Error ? error.message : "Falha ao enviar e-mail.",
      });
    }
  }

  return NextResponse.json({
    processed: dueItems.length,
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
