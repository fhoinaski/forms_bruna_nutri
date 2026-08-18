import { describe, expect, it } from "vitest";
import {
  classifySource,
  detectBrowserFamily,
  detectDeviceType,
  detectOsFamily,
  extractDomain,
  isBotUserAgent,
} from "@/lib/analytics/classify";

describe("classifySource", () => {
  it("classifica whatsapp por utm_source", () => {
    expect(classifySource({ utmSource: "whatsapp", utmMedium: null, referrerDomain: null })).toBe("whatsapp");
  });

  it("classifica social por utm_source conhecido (instagram)", () => {
    expect(classifySource({ utmSource: "instagram", utmMedium: "social", referrerDomain: null })).toBe("social");
  });

  it("classifica pago por utm_medium cpc", () => {
    expect(classifySource({ utmSource: "google", utmMedium: "cpc", referrerDomain: null })).toBe("paid");
  });

  it("classifica email por utm_medium", () => {
    expect(classifySource({ utmSource: "newsletter", utmMedium: "email", referrerDomain: null })).toBe("email");
  });

  it("UTM tem prioridade sobre referrer (navegacao interna nao sobrescreve atribuicao)", () => {
    expect(classifySource({ utmSource: "instagram", utmMedium: "social", referrerDomain: "google.com" })).toBe("social");
  });

  it("sem UTM, classifica busca organica pelo dominio do referrer (google)", () => {
    expect(classifySource({ utmSource: null, utmMedium: null, referrerDomain: "google.com" })).toBe("organic_search");
  });

  it("sem UTM, classifica social pelo dominio do referrer (instagram)", () => {
    expect(classifySource({ utmSource: null, utmMedium: null, referrerDomain: "instagram.com" })).toBe("social");
  });

  it("sem UTM, classifica whatsapp pelo dominio do referrer (wa.me)", () => {
    expect(classifySource({ utmSource: null, utmMedium: null, referrerDomain: "wa.me" })).toBe("whatsapp");
  });

  it("sem UTM e sem referrer, classifica direct", () => {
    expect(classifySource({ utmSource: null, utmMedium: null, referrerDomain: null })).toBe("direct");
  });

  it("referrer de dominio desconhecido vira referral, nunca direct", () => {
    expect(classifySource({ utmSource: null, utmMedium: null, referrerDomain: "algumoutrosite.com.br" })).toBe("referral");
  });

  it("nao inventa 'organic_search' quando so ha UTM sem medium reconhecido", () => {
    expect(classifySource({ utmSource: "parceiro-x", utmMedium: "banner", referrerDomain: null })).toBe("other");
  });
});

describe("extractDomain", () => {
  it("extrai dominio sem www", () => {
    expect(extractDomain("https://www.google.com/search?q=bruna")).toBe("google.com");
  });

  it("retorna null para valor ausente ou invalido", () => {
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain(undefined)).toBeNull();
    expect(extractDomain("not-a-url")).toBeNull();
  });
});

describe("detectDeviceType", () => {
  it("detecta mobile por iphone", () => {
    expect(detectDeviceType("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("mobile");
  });

  it("detecta tablet por ipad", () => {
    expect(detectDeviceType("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("tablet");
  });

  it("detecta desktop por padrao com UA de navegador comum", () => {
    expect(detectDeviceType("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")).toBe("desktop");
  });

  it("retorna unknown quando nao ha User-Agent", () => {
    expect(detectDeviceType(null)).toBe("unknown");
    expect(detectDeviceType(undefined)).toBe("unknown");
  });
});

describe("detectBrowserFamily / detectOsFamily", () => {
  it("detecta Chrome no Windows", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    expect(detectBrowserFamily(ua)).toBe("Chrome");
    expect(detectOsFamily(ua)).toBe("Windows");
  });

  it("detecta Safari no iOS", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(detectBrowserFamily(ua)).toBe("Safari");
    expect(detectOsFamily(ua)).toBe("iOS");
  });
});

describe("isBotUserAgent", () => {
  it("marca Googlebot como bot", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
  });

  it("marca curl como bot", () => {
    expect(isBotUserAgent("curl/8.4.0")).toBe(true);
  });

  it("marca User-Agent ausente como suspeito (bot)", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
  });

  it("nao marca um navegador real comum como bot", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    expect(isBotUserAgent(ua)).toBe(false);
  });
});
