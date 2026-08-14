import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/session";
import { loadClientSnapshot } from "@/lib/clinical/client-snapshot";
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
  const snapshot = await loadClientSnapshot(id);
  if (!snapshot) redirect("/dashboard/clients");

  return <ClientWorkspace initialData={snapshot} />;
}