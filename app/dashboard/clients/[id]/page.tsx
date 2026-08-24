import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/session";
import { loadClientSnapshot } from "@/lib/clinical/client-snapshot";
import { getPatientRecordSummary } from "@/lib/repositories/patient-record-summary";
import { getPatientClinicalTimeline } from "@/lib/repositories/patient-record-timeline";
import ClientWorkspace from "./ClientWorkspace";

/**
 * Server Component: carrega o snapshot inicial (1 d1Batch) e entrega para o
 * ClientWorkspace. Autorizacao revalidada aqui (defesa em profundidade) alem
 * do proxy.ts. Nada de dado sensivel sai desta camada alem do que ja era
 * exposto pela API antiga.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const { id } = await params;
  const [snapshot, patientRecordSummary, recentActivity] = await Promise.all([
    loadClientSnapshot(id),
    getPatientRecordSummary(id),
    getPatientClinicalTimeline(id, { limit: 5 }),
  ]);
  if (!snapshot || !patientRecordSummary || !recentActivity) redirect("/dashboard/clients");

  return <ClientWorkspace initialData={snapshot} initialSummary={patientRecordSummary} initialRecentActivity={recentActivity} />;
}
