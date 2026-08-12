import { afterEach, describe, expect, it } from "vitest";
import {
  executeSearchEditorialSources,
  hasEditorialSearchProvider,
  registerEditorialSearchProvider,
  searchEditorialSources,
  type EditorialSearchProvider,
} from "@/lib/ai/research/editorial-sources";

afterEach(() => {
  registerEditorialSearchProvider(null);
});

describe("editorial-sources — abstração de pesquisa, sem provedor único acoplado", () => {
  it("sem provider registrado, nunca inventa uma fonte: available=false e results=[]", async () => {
    expect(hasEditorialSearchProvider()).toBe(false);
    const result = await searchEditorialSources("tirzepatida efeitos adversos");
    expect(result).toEqual({ available: false, provider: null, results: [] });
  });

  it("com um provider registrado, repassa os resultados reais dele (sem inventar nada por conta própria)", async () => {
    const fakeProvider: EditorialSearchProvider = {
      name: "fake-provider",
      search: async (query) => [
        { title: `Bula oficial — ${query}`, organization: "ANVISA", year: 2024 },
      ],
    };
    registerEditorialSearchProvider(fakeProvider);
    expect(hasEditorialSearchProvider()).toBe(true);

    const result = await searchEditorialSources("tirzepatida");
    expect(result.available).toBe(true);
    expect(result.provider).toBe("fake-provider");
    expect(result.results).toEqual([{ title: "Bula oficial — tirzepatida", organization: "ANVISA", year: 2024 }]);
  });

  it("registrar null desativa o provider de novo", async () => {
    registerEditorialSearchProvider({ name: "x", search: async () => [] });
    expect(hasEditorialSearchProvider()).toBe(true);
    registerEditorialSearchProvider(null);
    expect(hasEditorialSearchProvider()).toBe(false);
  });

  it("executeSearchEditorialSources (a tool registrada) delega para searchEditorialSources", async () => {
    const result = await executeSearchEditorialSources({ query: "semaglutida" });
    expect(result).toEqual({ available: false, provider: null, results: [] });
  });
});
