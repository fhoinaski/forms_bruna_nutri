import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProposedAction } from "@/lib/ai/schemas/action.schema";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

const ctx = { adminId: "admin-1" };

describe("executeProposedAction — new_appointment", () => {
  it("aceita horário vindo com ISO no texto e cria consulta", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({
      getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Fernando" }),
      getClients: vi.fn(),
      createClient: vi.fn(),
    }));
    const createAppointment = vi.fn().mockResolvedValue("appt-1");
    vi.doMock("@/lib/repositories/appointments", () => ({ createAppointment }));
    vi.doMock("@/lib/repositories/availability", () => ({
      hasAppointmentConflict: vi.fn().mockResolvedValue(false),
      slotEnd: vi.fn().mockImplementation((startsAt: string) => {
        const start = new Date(startsAt);
        return new Date(start.getTime() + 60 * 60_000).toISOString();
      }),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_appointment",
      clientId: "client-1",
      fields: {
        title: "Consulta nutricional",
        appointment_type: "consulta",
        starts_at_display: "11/08 às 15:00 (2026-08-11T18:00:00.000Z)",
        location: "",
        notes: "",
      },
      risk: "sensitive",
      requiresConfirmation: true,
    };
    const result = await executeProposedAction(action, ctx);
    expect(result.data).toEqual({ appointmentId: "appt-1" });
    expect(createAppointment).toHaveBeenCalledWith(expect.objectContaining({
      client_id: "client-1",
      starts_at: "2026-08-11T18:00:00.000Z",
      ends_at: "2026-08-11T19:00:00.000Z",
    }));
  });
});

describe("executeProposedAction — new_task", () => {
  it("teste 10: entidade relacionada inexistente (cliente) é rejeitada", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null), getClients: vi.fn(), createClient: vi.fn() }));
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_task", clientId: "nao-existe",
      fields: { title: "Ligar", description: "", due_date_display: "" },
      risk: "sensitive", requiresConfirmation: true,
    };
    await expect(executeProposedAction(action, ctx)).rejects.toThrow(ProposalExecutionError);
  });

  it("cria a tarefa quando o cliente existe", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1", name: "Maria" }) }));
    const createClientTask = vi.fn().mockResolvedValue("task-1");
    vi.doMock("@/lib/repositories/client-tasks", () => ({ createClientTask }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_task", clientId: "client-1",
      fields: { title: "Ligar amanhã", description: "", due_date_display: "20/08/2026" },
      risk: "sensitive", requiresConfirmation: true,
    };
    const result = await executeProposedAction(action, ctx);
    expect(result.data).toEqual({ taskId: "task-1" });
    expect(createClientTask).toHaveBeenCalledWith(expect.objectContaining({ client_id: "client-1", due_date: "2026-08-20" }));
  });
});

describe("executeProposedAction — new_client", () => {
  it("revalida duplicidade por e-mail no momento da confirmação (não confia na busca antiga)", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({
      getClients: vi.fn().mockResolvedValue({ items: [{ id: "c1", name: "Maria Silva", email: "maria@example.com", phone: null }] }),
      createClient: vi.fn(),
    }));
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_client",
      fields: { name: "Maria Silva", email: "maria@example.com", phone: "", birth_date: "" },
      risk: "sensitive", requiresConfirmation: true,
    };
    await expect(executeProposedAction(action, ctx)).rejects.toThrow(ProposalExecutionError);
  });

  it("cadastra normalmente quando não há duplicidade real", async () => {
    const createClient = vi.fn().mockResolvedValue("client-novo");
    vi.doMock("@/lib/repositories/clients", () => ({
      getClients: vi.fn().mockResolvedValue({ items: [] }),
      createClient,
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_client",
      fields: { name: "João Souza", email: "joao@example.com", phone: "", birth_date: "" },
      risk: "sensitive", requiresConfirmation: true,
    };
    const result = await executeProposedAction(action, ctx);
    expect(result.data).toEqual({ clientId: "client-novo" });
  });
});

describe("executeProposedAction — new_recipe", () => {
  it("teste 13 (variação): rejeita ingrediente cujo taco_number não existe de verdade na base — valor calculável nunca vem confiável do LLM", async () => {
    vi.doMock("@/lib/nutrition/taco", () => ({ getTacoFoodByNumber: vi.fn().mockReturnValue(null) }));
    vi.doMock("@/lib/repositories/recipes", () => ({
      createRecipe: vi.fn(),
      RECIPE_MEAL_GROUPS: ["cafe_da_manha", "almoco", "jantar", "lanche"],
    }));
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_recipe", title: "Receita", meal_group: "almoco", servings: 1, preparation_steps: "",
      ingredients: [{ food_name: "Alimento inventado", grams: 100, taco_number: 99999 }],
      risk: "sensitive", requiresConfirmation: true,
    };
    await expect(executeProposedAction(action, ctx)).rejects.toThrow(ProposalExecutionError);
  });

  it("cria a receita sem passar nutrition_override — os macros vêm sempre do cálculo determinístico de createRecipe", async () => {
    vi.doMock("@/lib/nutrition/taco", () => ({ getTacoFoodByNumber: vi.fn().mockReturnValue({ numero: 123, nome: "Frango" }) }));
    const createRecipe = vi.fn().mockResolvedValue("recipe-1");
    vi.doMock("@/lib/repositories/recipes", () => ({
      createRecipe,
      RECIPE_MEAL_GROUPS: ["cafe_da_manha", "almoco", "jantar", "lanche"],
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_recipe", title: "Frango grelhado", meal_group: "almoco", servings: 2, preparation_steps: "Grelhar.",
      ingredients: [{ food_name: "Frango", grams: 150, taco_number: 123 }],
      risk: "sensitive", requiresConfirmation: true,
    };
    const result = await executeProposedAction(action, ctx);
    expect(result.data).toEqual({ recipeId: "recipe-1" });
    const callArg = createRecipe.mock.calls[0][0];
    expect(callArg.nutrition_override).toBeUndefined();
  });
});

describe("executeProposedAction — new_protocol", () => {
  it("rejeita cliente inexistente", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_protocol", clientId: "nao-existe",
      fields: { title: "Protocolo", category: "", description: "", professional_notes: "" },
      risk: "clinical", requiresConfirmation: true,
    };
    await expect(executeProposedAction(action, ctx)).rejects.toThrow(ProposalExecutionError);
  });

  it("cria o protocolo e aplica ao cliente numa unica operacao atomica", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1" }) }));
    const createProtocolAndApplyToClient = vi.fn().mockResolvedValue({ protocolId: "protocol-1", clientProtocolId: "cp-1" });
    vi.doMock("@/lib/repositories/client-protocols", () => ({
      createProtocolAndApplyToClient,
      getClientProtocolById: vi.fn(),
      updateClientProtocol: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_protocol", clientId: "client-1",
      fields: { title: "Protocolo emagrecimento", category: "Emagrecimento", description: "", professional_notes: "" },
      risk: "clinical", requiresConfirmation: true,
    };
    const result = await executeProposedAction(action, ctx);
    expect(result.data).toEqual({ protocolId: "protocol-1", clientProtocolId: "cp-1" });
    expect(createProtocolAndApplyToClient).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "admin-1", kind: "personalized", clientId: "client-1" }));
  });
});

describe("executeProposedAction — client_protocol (ownership/escopo)", () => {
  it("teste 11: rejeita quando o protocolo pertence a outro cliente (escopo errado)", async () => {
    vi.doMock("@/lib/repositories/client-protocols", () => ({
      getClientProtocolById: vi.fn().mockResolvedValue({ id: "cp-1", client_id: "OUTRO-CLIENTE" }),
      updateClientProtocol: vi.fn(),
      applyProtocolToClient: vi.fn(),
    }));
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "client_protocol", clientId: "client-1", clientProtocolId: "cp-1", professionalNotes: "Notas.",
      risk: "clinical", requiresConfirmation: true,
    };
    await expect(executeProposedAction(action, ctx)).rejects.toThrow(ProposalExecutionError);
  });

  it("atualiza as notas quando o protocolo pertence ao cliente certo", async () => {
    const updateClientProtocol = vi.fn();
    vi.doMock("@/lib/repositories/client-protocols", () => ({
      getClientProtocolById: vi.fn().mockResolvedValue({ id: "cp-1", client_id: "client-1" }),
      updateClientProtocol,
      applyProtocolToClient: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "client_protocol", clientId: "client-1", clientProtocolId: "cp-1", professionalNotes: "Evoluiu bem.",
      risk: "clinical", requiresConfirmation: true,
    };
    const result = await executeProposedAction(action, ctx);
    expect(result.data).toEqual({ clientProtocolId: "cp-1" });
    expect(updateClientProtocol).toHaveBeenCalledWith({ id: "cp-1", professionalNotes: "Evoluiu bem." });
  });
});

describe("executeProposedAction — nutrition_record (allow-list, nunca coluna arbitrária)", () => {
  it("descarta silenciosamente qualquer chave que não seja um campo real do prontuário", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue({ id: "client-1" }) }));
    const updateNutritionRecord = vi.fn().mockResolvedValue({});
    vi.doMock("@/lib/repositories/nutrition-records", () => ({ updateNutritionRecord }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "nutrition_record", clientId: "client-1",
      fields: {
        clinical_history: "Texto legítimo.",
        // "id", "status" e "is_admin" nao sao campos reais do prontuario —
        // nao podem virar UPDATE de coluna arbitraria.
        id: "outro-id-qualquer",
        status: "excluido",
        is_admin: "true",
      },
      risk: "clinical", requiresConfirmation: true,
    };
    await executeProposedAction(action, ctx);
    const updatePayload = updateNutritionRecord.mock.calls[0][1];
    expect(updatePayload).toEqual({ clinical_history: "Texto legítimo." });
  });

  it("rejeita cliente inexistente", async () => {
    vi.doMock("@/lib/repositories/clients", () => ({ getClientById: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/repositories/nutrition-records", () => ({ updateNutritionRecord: vi.fn() }));
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "nutrition_record", clientId: "nao-existe",
      fields: { clinical_history: "Texto." },
      risk: "clinical", requiresConfirmation: true,
    };
    await expect(executeProposedAction(action, ctx)).rejects.toThrow(ProposalExecutionError);
  });
});

describe("executeProposedAction — pre_analysis (allow-list, entidade relacionada)", () => {
  it("teste 10: rejeita formulário/submission inexistente", async () => {
    vi.doMock("@/lib/repositories/submissions", () => ({ getSubmissionById: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/repositories/pre-analyses", () => ({ upsertPreAnalysis: vi.fn() }));
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "pre_analysis", submissionId: "nao-existe",
      fields: { summary: "Resumo." },
      risk: "clinical", requiresConfirmation: true,
    };
    await expect(executeProposedAction(action, ctx)).rejects.toThrow(ProposalExecutionError);
  });

  it("só grava campos conhecidos da pré-análise", async () => {
    vi.doMock("@/lib/repositories/submissions", () => ({ getSubmissionById: vi.fn().mockResolvedValue({ id: "submission-1" }) }));
    const upsertPreAnalysis = vi.fn().mockResolvedValue("pa-1");
    vi.doMock("@/lib/repositories/pre-analyses", () => ({ upsertPreAnalysis }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "pre_analysis", submissionId: "submission-1",
      fields: { summary: "Resumo.", not_a_real_field: "ignorar" },
      risk: "clinical", requiresConfirmation: true,
    };
    await executeProposedAction(action, ctx);
    expect(upsertPreAnalysis).toHaveBeenCalledWith({ submission_id: "submission-1", admin_id: "admin-1", summary: "Resumo." });
  });
});

describe("executeProposedAction — new_blog_post", () => {
  it("rejeita quando faltam campos obrigatórios", async () => {
    vi.doMock("@/lib/repositories/blog-posts", () => ({ createBlogPost: vi.fn() }));
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_blog_post",
      fields: { title: "", excerpt: "", content_markdown: "", category: "", tags: "", seo_title: "", seo_description: "" },
      risk: "sensitive", requiresConfirmation: true,
    };
    await expect(executeProposedAction(action, ctx)).rejects.toThrow(ProposalExecutionError);
  });

  it("cria o rascunho quando os campos obrigatórios estão presentes", async () => {
    const createBlogPost = vi.fn().mockResolvedValue("post-1");
    vi.doMock("@/lib/repositories/blog-posts", () => ({ createBlogPost }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_blog_post",
      fields: { title: "Título", excerpt: "Resumo", content_markdown: "Conteúdo completo.", category: "", tags: "a, b", seo_title: "", seo_description: "" },
      risk: "sensitive", requiresConfirmation: true,
    };
    const result = await executeProposedAction(action, ctx);
    expect(result.data).toEqual({ blogPostId: "post-1" });
    expect(createBlogPost).toHaveBeenCalledWith(expect.objectContaining({ status: "draft", tags: ["a", "b"] }));
  });
});
