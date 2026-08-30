import { describe, expect, it } from "vitest";
import { MAX_PATIENT_FILE_BYTES, patientFileObjectKey, safePatientFilename } from "@/lib/storage/patient-files";

describe("patient file storage contract", () => {
  it("uses a generated patient-specific key and never the original filename", () => {
    const key = patientFileObjectKey("patient-a", "file-a", "application/pdf");
    expect(key).toBe("patients/patient-a/file-a/document.pdf");
    expect(key).not.toContain("laudo");
  });

  it("normalizes unsafe display names and keeps the size limit explicit", () => {
    expect(safePatientFilename("../../laudo.pdf")).toBe(".._.._laudo.pdf");
    expect(MAX_PATIENT_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});
