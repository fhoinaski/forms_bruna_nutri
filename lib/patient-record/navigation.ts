export function getPatientRecordHref(patientId: string, tab?: string): string {
  const params = new URLSearchParams();
  if (tab) params.set("tab", tab);
  const query = params.toString();
  return `/dashboard/clients/${patientId}${query ? `?${query}` : ""}`;
}

export function getConsultationHref(patientId: string, consultationId?: string | null): string {
  const params = new URLSearchParams();
  if (consultationId) params.set("sessionId", consultationId);
  const query = params.toString();
  return `/dashboard/clients/${patientId}/consulta${query ? `?${query}` : ""}`;
}

export function getMealPlanHref(patientId: string, options: { consultationId?: string | null; draft?: boolean } = {}): string {
  const params = new URLSearchParams({ tab: "plano-alimentar" });
  if (options.consultationId) {
    params.set("returnTo", "consulta");
    params.set("consultationId", options.consultationId);
  }
  if (options.draft) params.set("plan", "draft");
  return `/dashboard/clients/${patientId}?${params}`;
}

export function getAnthropometryHref(patientId: string, consultationId?: string | null): string {
  const params = new URLSearchParams({ tab: "antropometria" });
  if (consultationId) {
    params.set("returnTo", "consulta");
    params.set("consultationId", consultationId);
  }
  return `/dashboard/clients/${patientId}?${params}`;
}

export function getProtocolHref(patientId: string, consultationId?: string | null): string {
  const params = new URLSearchParams({ tab: "plano-alimentar", view: "protocolos" });
  if (consultationId) {
    params.set("returnTo", "consulta");
    params.set("consultationId", consultationId);
  }
  return `/dashboard/clients/${patientId}?${params}`;
}

export function getScheduleReturnHref(patientId: string, consultationId?: string | null): string {
  const params = new URLSearchParams({ patientId, type: "retorno" });
  if (consultationId) params.set("consultationId", consultationId);
  return `/dashboard/agenda?${params}`;
}
