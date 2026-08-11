"use client";

import { useParams } from "next/navigation";
import { ConsultationWorkspace } from "@/components/consultation/ConsultationWorkspace";

/**
 * Rota dedicada do Modo Consulta (FASE 1, secao 2 do pedido) —
 * /dashboard/clients/[id]/consulta. Thin wrapper: toda a logica vive em
 * ConsultationWorkspace (components/consultation/*), nunca aqui.
 */
export default function ConsultationPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-[1600px]">
      <ConsultationWorkspace clientId={params.id} />
    </div>
  );
}
