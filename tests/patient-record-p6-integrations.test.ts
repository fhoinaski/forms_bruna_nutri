import { describe, expect, it } from "vitest";
import {
  getAnthropometryHref,
  getConsultationHref,
  getMealPlanHref,
  getPatientRecordHref,
  getProtocolHref,
  getScheduleReturnHref,
} from "@/lib/patient-record/navigation";

describe("Patient Record P6 navigation contract", () => {
  const patientId = "patient-a";
  const consultationId = "consultation-a";

  it("keeps the patient context in clinical module links", () => {
    expect(getPatientRecordHref(patientId, "anamnese")).toBe("/dashboard/clients/patient-a?tab=anamnese");
    expect(getAnthropometryHref(patientId, consultationId)).toContain("tab=antropometria");
    expect(getProtocolHref(patientId, consultationId)).toContain("view=protocolos");
    expect(getMealPlanHref(patientId, { consultationId, draft: true })).toContain("plan=draft");
  });

  it("preserves the consultation return path without trusting a foreign entity id", () => {
    expect(getConsultationHref(patientId, consultationId)).toBe("/dashboard/clients/patient-a/consulta?sessionId=consultation-a");
    expect(getMealPlanHref(patientId, { consultationId })).toContain("consultationId=consultation-a");
    expect(getScheduleReturnHref(patientId, consultationId)).toBe("/dashboard/agenda?patientId=patient-a&type=retorno&consultationId=consultation-a");
  });
});
