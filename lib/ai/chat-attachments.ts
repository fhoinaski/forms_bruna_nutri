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
