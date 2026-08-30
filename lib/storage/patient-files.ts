/** Private patient-file storage for Vercel Node. Never returns public or permanent URLs. */
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface PatientFilesObject {
  body: ReadableStream<Uint8Array>;
  httpMetadata?: { contentType?: string };
}

export interface PatientFilesStorage {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<void>;
  get(key: string): Promise<PatientFilesObject | null>;
  delete(key: string): Promise<void>;
}

export type PatientFilesStorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
};

type S3ClientLike = { send(command: unknown): Promise<unknown> };
type S3GetBody = { transformToWebStream?: () => ReadableStream<Uint8Array> };

const REQUIRED_R2_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PATIENT_FILES_BUCKET"] as const;
let testStorage: PatientFilesStorage | undefined;

export function getPatientFilesStorageConfig(env: NodeJS.ProcessEnv = process.env): PatientFilesStorageConfig {
  const missing = REQUIRED_R2_ENV.filter((key) => !env[key]?.trim());
  if (missing.length) {
    throw new Error(`Private patient-file storage is unavailable: missing server configuration (${missing.join(", ")}).`);
  }
  const accountId = env.R2_ACCOUNT_ID!.trim();
  const bucket = env.R2_PATIENT_FILES_BUCKET!.trim();
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error("Private patient-file storage is unavailable: invalid R2_PATIENT_FILES_BUCKET.");
  }
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new Error("Private patient-file storage is unavailable: invalid R2_ACCOUNT_ID.");
  }
  return {
    accountId,
    accessKeyId: env.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!.trim(),
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

function createR2Client(config: PatientFilesStorageConfig): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

function isMissingObjectError(error: unknown): boolean {
  const candidate = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return candidate?.name === "NoSuchKey" || candidate?.Code === "NoSuchKey" || candidate?.$metadata?.httpStatusCode === 404;
}

function toWebStream(body: unknown): ReadableStream<Uint8Array> {
  if (body && typeof (body as S3GetBody).transformToWebStream === "function") {
    return (body as S3GetBody).transformToWebStream!();
  }
  if (body instanceof ReadableStream) return body as ReadableStream<Uint8Array>;
  throw new Error("Private patient-file storage returned an unreadable object body.");
}

export function createR2PatientFilesStorage(config: PatientFilesStorageConfig, client: S3ClientLike = createR2Client(config)): PatientFilesStorage {
  return {
    async put(key, value, options) {
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: new Uint8Array(value), ContentType: options.httpMetadata.contentType }));
    },
    async get(key) {
      try {
        const response = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key })) as { Body?: unknown; ContentType?: string };
        if (!response.Body) return null;
        return { body: toWebStream(response.Body), httpMetadata: response.ContentType ? { contentType: response.ContentType } : undefined };
      } catch (error) {
        if (isMissingObjectError(error)) return null;
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}

export function setPatientFilesStorageForTests(storage: PatientFilesStorage | undefined): void {
  if (process.env.NODE_ENV !== "test") throw new Error("The patient file test storage is unavailable outside tests.");
  testStorage = storage;
}

export function getPatientFilesStorage(): PatientFilesStorage {
  if (process.env.NODE_ENV === "test" && testStorage) return testStorage;
  return createR2PatientFilesStorage(getPatientFilesStorageConfig());
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
