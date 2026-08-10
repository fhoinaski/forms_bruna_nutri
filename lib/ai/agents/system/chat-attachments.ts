export const ALLOWED_ATTACHMENT_MEDIA_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AllowedAttachmentMediaType = typeof ALLOWED_ATTACHMENT_MEDIA_TYPES[number];

// ~9MB de arquivo original vira ~12MB em base64 (overhead de ~33%).
export const MAX_ATTACHMENT_RAW_BYTES = 9 * 1024 * 1024;
export const MAX_ATTACHMENT_BASE64_LENGTH = 12_000_000;
export const MAX_ATTACHMENTS_PER_MESSAGE = 1;

export interface ValidatedChatAttachment {
  name: string;
  mediaType: AllowedAttachmentMediaType;
  data: string;
  rawBytes: number;
}

function normalizeBase64(value: string): string {
  const commaIndex = value.indexOf(",");
  return (commaIndex >= 0 ? value.slice(commaIndex + 1) : value).replace(/\s/g, "");
}

function detectMediaType(buffer: Buffer): AllowedAttachmentMediaType | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "image/webp";
  return null;
}

export function validateChatAttachment(input: {
  name: string;
  mediaType: AllowedAttachmentMediaType;
  data: string;
}): ValidatedChatAttachment {
  if (!ALLOWED_ATTACHMENT_MEDIA_TYPES.includes(input.mediaType)) {
    throw new Error("Formato de anexo nao permitido.");
  }
  if (input.data.length > MAX_ATTACHMENT_BASE64_LENGTH) {
    throw new Error("Anexo muito grande para analise com IA.");
  }

  const normalized = normalizeBase64(input.data);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("Anexo invalido.");
  }

  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length || buffer.length > MAX_ATTACHMENT_RAW_BYTES) {
    throw new Error("Anexo muito grande para analise com IA.");
  }

  const detected = detectMediaType(buffer);
  if (!detected || detected !== input.mediaType) {
    throw new Error("O tipo real do anexo nao corresponde ao formato informado.");
  }

  return {
    name: input.name.replace(/[^\w.\-() ]/g, "").slice(0, 120) || "anexo",
    mediaType: input.mediaType,
    data: normalized,
    rawBytes: buffer.length,
  };
}
