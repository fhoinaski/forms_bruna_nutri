import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createR2PatientFilesStorage, getPatientFilesStorageConfig, MAX_PATIENT_FILE_BYTES, patientFileObjectKey, safePatientFilename } from "@/lib/storage/patient-files";

const config = {
  accountId: "a".repeat(32), accessKeyId: "test-access-key", secretAccessKey: "test-secret", bucket: "bruna-nutri-patient-files-test",
  endpoint: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
};

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

  it("builds the official account-scoped R2 endpoint from server-only configuration", () => {
    expect(getPatientFilesStorageConfig({
      R2_ACCOUNT_ID: "a".repeat(32), R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", R2_PATIENT_FILES_BUCKET: "bruna-nutri-patient-files-test",
    })).toEqual({ ...config, accessKeyId: "key", secretAccessKey: "secret" });
  });

  it("fails closed when any required server credential is absent", () => {
    expect(() => getPatientFilesStorageConfig({ R2_ACCOUNT_ID: "a".repeat(32) })).toThrow("missing server configuration");
    expect(() => getPatientFilesStorageConfig({
      R2_ACCOUNT_ID: "a".repeat(32), R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", R2_PATIENT_FILES_BUCKET: "INVALID_BUCKET",
    })).toThrow("invalid R2_PATIENT_FILES_BUCKET");
  });

  it("uses S3-compatible put, get, missing-object and delete operations without public URLs", async () => {
    const stream = new ReadableStream<Uint8Array>();
    const send = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Body: { transformToWebStream: () => stream }, ContentType: "application/pdf" })
      .mockRejectedValueOnce({ name: "NoSuchKey" })
      .mockResolvedValueOnce({});
    const storage = createR2PatientFilesStorage(config, { send });
    await storage.put("patients/a/file/document.pdf", new Uint8Array([1, 2]).buffer, { httpMetadata: { contentType: "application/pdf" } });
    const object = await storage.get("patients/a/file/document.pdf");
    const missing = await storage.get("patients/a/missing/document.pdf");
    await storage.delete("patients/a/file/document.pdf");
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect((send.mock.calls[0][0] as PutObjectCommand).input).toMatchObject({ Bucket: config.bucket, Key: "patients/a/file/document.pdf", ContentType: "application/pdf" });
    expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
    expect(object?.body).toBe(stream);
    expect(object?.httpMetadata?.contentType).toBe("application/pdf");
    expect(missing).toBeNull();
    expect(send.mock.calls[3][0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it("propagates provider failures instead of treating them as missing objects", async () => {
    const storage = createR2PatientFilesStorage(config, { send: vi.fn().mockRejectedValue(new Error("provider unavailable")) });
    await expect(storage.get("patients/a/file/document.pdf")).rejects.toThrow("provider unavailable");
  });
});
