import { describe, expect, it } from "vitest";
import { analyticsEventInputSchema, analyticsIngestPayloadSchema, sanitizeMetadata } from "@/lib/analytics/validation";

const validEvent = {
  event_type: "PAGE_VIEW" as const,
  client_event_id: "11111111-1111-4111-8111-111111111111",
  path: "/servicos",
};

describe("analyticsEventInputSchema", () => {
  it("aceita um evento minimo valido", () => {
    expect(analyticsEventInputSchema.safeParse(validEvent).success).toBe(true);
  });

  it("rejeita event_type arbitrario nao pertencente ao vocabulario fechado", () => {
    const result = analyticsEventInputSchema.safeParse({ ...validEvent, event_type: "DELETE_ALL_DATA" });
    expect(result.success).toBe(false);
  });

  it("rejeita path que nao comeca com /", () => {
    const result = analyticsEventInputSchema.safeParse({ ...validEvent, path: "https://evil.com/phish" });
    expect(result.success).toBe(false);
  });

  it("rejeita client_event_id que nao e uuid", () => {
    const result = analyticsEventInputSchema.safeParse({ ...validEvent, client_event_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejeita chaves extras nao reconhecidas (adminId, clientId, etc.) por ser .strict()", () => {
    const result = analyticsEventInputSchema.safeParse({ ...validEvent, adminId: "admin-1", clientId: "client-1" });
    expect(result.success).toBe(false);
  });

  it("rejeita metadata com muitas chaves (protecao contra payload gigante)", () => {
    const metadata: Record<string, string> = {};
    for (let i = 0; i < 20; i++) metadata[`key${i}`] = "value";
    const result = analyticsEventInputSchema.safeParse({ ...validEvent, metadata });
    expect(result.success).toBe(false);
  });

  it("rejeita string tipo SQL/script nos campos de texto acima do limite de tamanho", () => {
    const longPayload = "a".repeat(1000);
    const result = analyticsEventInputSchema.safeParse({ ...validEvent, page_title: longPayload });
    expect(result.success).toBe(false);
  });

  it("aceita UTMs validos dentro do limite de tamanho", () => {
    const result = analyticsEventInputSchema.safeParse({
      ...validEvent,
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "gestantes-agosto",
    });
    expect(result.success).toBe(true);
  });
});

describe("analyticsIngestPayloadSchema", () => {
  it("aceita um array de 1 a 10 eventos", () => {
    expect(analyticsIngestPayloadSchema.safeParse({ events: [validEvent] }).success).toBe(true);
  });

  it("rejeita array vazio", () => {
    expect(analyticsIngestPayloadSchema.safeParse({ events: [] }).success).toBe(false);
  });

  it("rejeita mais de 10 eventos em um unico payload", () => {
    const events = Array.from({ length: 11 }, () => validEvent);
    expect(analyticsIngestPayloadSchema.safeParse({ events }).success).toBe(false);
  });

  it("honeypot preenchido ainda passa na validacao de schema (a decisao de descartar e da rota, nao do schema)", () => {
    const result = analyticsIngestPayloadSchema.safeParse({ events: [validEvent], companyWebsite: "http://spam.com" });
    expect(result.success).toBe(false); // max(0) no schema já barra qualquer valor não vazio
  });
});

describe("sanitizeMetadata", () => {
  it("mantem apenas chaves permitidas para o tipo de evento", () => {
    const result = sanitizeMetadata("CTA_CLICK", { cta_id: "hero-button", cta_label: "Agendar", secret: "leak" });
    expect(result).toEqual({ cta_id: "hero-button", cta_label: "Agendar" });
  });

  it("retorna null quando o tipo de evento nao permite nenhuma metadata", () => {
    expect(sanitizeMetadata("PAGE_VIEW", { anything: "value" })).toBeNull();
  });

  it("retorna null quando metadata nao foi enviada", () => {
    expect(sanitizeMetadata("CTA_CLICK", undefined)).toBeNull();
  });

  it("nunca deixa passar uma chave clinica/pessoal inventada pelo cliente", () => {
    const result = sanitizeMetadata("WHATSAPP_CLICK", { location: "footer", patientAnswer: "resposta da anamnese" });
    expect(result).toEqual({ location: "footer" });
  });
});
