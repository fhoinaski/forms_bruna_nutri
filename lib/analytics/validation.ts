import { z } from "zod";
import { ALLOWED_METADATA_KEYS, ANALYTICS_EVENT_TYPES } from "@/lib/analytics/types";

const metadataValueSchema = z.union([z.string().max(200), z.number(), z.boolean()]);

// Metadata bruta aceita qualquer chave curta no shape — o filtro real por
// chave permitida (por event_type) acontece em sanitizeMetadata, nunca so
// no zod, porque a lista de chaves permitidas depende do event_type.
const rawMetadataSchema = z
  .record(z.string().max(40), metadataValueSchema)
  .refine((value) => Object.keys(value).length <= 10, { message: "Metadata com muitas chaves." })
  .optional();

export const analyticsEventInputSchema = z
  .object({
    event_type: z.enum(ANALYTICS_EVENT_TYPES),
    client_event_id: z.string().uuid(),
    path: z
      .string()
      .min(1)
      .max(300)
      .regex(/^\//, "path deve ser relativo e comecar com /"),
    page_title: z.string().max(200).optional(),
    referrer: z.string().max(500).optional(),
    utm_source: z.string().max(150).optional(),
    utm_medium: z.string().max(150).optional(),
    utm_campaign: z.string().max(150).optional(),
    utm_term: z.string().max(150).optional(),
    utm_content: z.string().max(150).optional(),
    metadata: rawMetadataSchema,
  })
  .strict();

export type AnalyticsEventInput = z.infer<typeof analyticsEventInputSchema>;

export const analyticsIngestPayloadSchema = z
  .object({
    events: z.array(analyticsEventInputSchema).min(1).max(10),
    // honeypot — nunca preenchido por um visitante real.
    companyWebsite: z.string().max(0).optional(),
  })
  .strict();

export type AnalyticsIngestPayload = z.infer<typeof analyticsIngestPayloadSchema>;

// Mantem apenas as chaves de metadata explicitamente permitidas para aquele
// tipo de evento — remove qualquer coisa fora da lista, mesmo que valida
// pelo zod. Defesa em profundidade contra o cliente inventar campos.
export function sanitizeMetadata(
  eventType: (typeof ANALYTICS_EVENT_TYPES)[number],
  metadata: Record<string, string | number | boolean> | undefined
): Record<string, string | number | boolean> | null {
  if (!metadata) return null;
  const allowedKeys = ALLOWED_METADATA_KEYS[eventType];
  if (allowedKeys.length === 0) return null;
  const sanitized: Record<string, string | number | boolean> = {};
  for (const key of allowedKeys) {
    if (key in metadata) sanitized[key] = metadata[key];
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}
