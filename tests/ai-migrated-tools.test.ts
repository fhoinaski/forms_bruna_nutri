import { describe, expect, it } from "vitest";
import { getToolDefinition, getToolRisk } from "../lib/ai/tools/registry";
import { buildProposedAction } from "../lib/ai/tools/proposal-builders";

describe("migrated AI tools", () => {
  it("classifies protocol creation as clinical and never auto-applies it", () => {
    expect(getToolRisk("proposeNewClientProtocol")).toBe("clinical");

    const action = buildProposedAction(
      "proposeNewClientProtocol",
      { title: "Conduta inicial", category: "Emagrecimento" },
      { clientId: "client-1" }
    );

    expect(action?.risk).toBe("clinical");
    expect(action?.requiresConfirmation).toBe(true);
  });

  it("keeps blog creation as a sensitive draft proposal", () => {
    expect(getToolRisk("proposeNewBlogPost")).toBe("sensitive");
    const tool = getToolDefinition("proposeNewBlogPost");

    const parsed = tool?.inputSchema.safeParse({
      title: "Alimentacao na gestacao",
      excerpt: "Um resumo acessivel sobre cuidados gerais na gestacao.",
      content_markdown: "## Introducao\n\nConteudo educativo geral, sem dados de pacientes.".repeat(8),
    });

    expect(parsed?.success).toBe(true);
  });
});
