/** Private R2 contract for patient files. Never returns public or permanent URLs. */
export interface PatientFilesObject {
  body: ReadableStream<Uint8Array>;
  httpMetadata?: { contentType?: string };
}

export interface PatientFilesBucket {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<PatientFilesObject | null>;
  delete(key: string): Promise<void>;
}

declare global {
  // The Cloudflare runtime adapter exposes the private R2 binding under this exact name.
  // It is intentionally not a URL, credential, or client-provided value.
  var PATIENT_FILES_BUCKET: PatientFilesBucket | undefined;
}

let testBucket: PatientFilesBucket | undefined;

export function setPatientFilesBucketForTests(bucket: PatientFilesBucket | undefined): void {
  if (process.env.NODE_ENV !== "test") throw new Error("The patient file test bucket is unavailable outside tests.");
  testBucket = bucket;
}

export function getPatientFilesBucket(): PatientFilesBucket {
  if (process.env.NODE_ENV === "test" && testBucket) return testBucket;
  const bucket = globalThis.PATIENT_FILES_BUCKET;
  if (!bucket) {
    throw new Error("PATIENT_FILES_BUCKET is not configured. Private patient-file delivery is unavailable.");
  }
  return bucket;
}

export const ALLOWED_PATIENT_FILE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PATIENT_FILE_BYTES = 10 * 1024 * 1024;

export function isAllowedPatientFile(file: File): boolean {
  return ALLOWED_PATIENT_FILE_MIME_TYPES.includes(file.type as typeof ALLOWED_PATIENT_FILE_MIME_TYPES[number])
    && file.size > 0 && file.size <= MAX_PATIENT_FILE_BYTES;
}

export function safePatientFilename(value: string): string {
  const cleaned = value.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 180);
  return cleaned || "arquivo";
}

export function patientFileObjectKey(patientId: string, fileId: string, mimeType: string): string {
  const extension = mimeType === "application/pdf" ? "pdf" : mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
  return `patients/${patientId}/${fileId}/document.${extension}`;
}
