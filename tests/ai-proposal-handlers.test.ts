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
    expect(createBlogPost).toHaveBeenCalledWith(expect.objectContaining({ status: "draft", tags: ["a", "b"], content_domain: null, references: [] }));
  });

  it("repassa content_domain e references reais (medicamento) para o repositório", async () => {
    const createBlogPost = vi.fn().mockResolvedValue("post-2");
    vi.doMock("@/lib/repositories/blog-posts", () => ({ createBlogPost }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_blog_post",
      fields: {
        title: "Mounjaro: o que é a tirzepatida",
        excerpt: "Resumo educativo sobre tirzepatida.",
        content_markdown: "Conteúdo educativo sobre tirzepatida e acompanhamento nutricional.",
        category: "", tags: "",
        seo_title: "", seo_description: "",
        content_domain: "medication",
        references_json: JSON.stringify([{ title: "Bula oficial", organization: "ANVISA", year: 2024 }]),
      },
      risk: "sensitive", requiresConfirmation: true,
    };
    await executeProposedAction(action, ctx);
    expect(createBlogPost).toHaveBeenCalledWith(
      expect.objectContaining({
        content_domain: "medication",
        references: [{ title: "Bula oficial", organization: "ANVISA", year: 2024 }],
      })
    );
  });

  it("nunca deixa um content_domain inválido ou references malformadas quebrar a execução — cai para null/[] (revalida no momento de salvar, não confia no que a tool devolveu)", async () => {
    const createBlogPost = vi.fn().mockResolvedValue("post-3");
    vi.doMock("@/lib/repositories/blog-posts", () => ({ createBlogPost }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = {
      kind: "new_blog_post",
      fields: {
        title: "Título", excerpt: "Resumo", content_markdown: "Conteúdo completo.",
        category: "", tags: "", seo_title: "", seo_description: "",
        content_domain: "algo-que-nao-existe",
        references_json: "isto não é um JSON válido {",
      },
      risk: "sensitive", requiresConfirmation: true,
    };
    await executeProposedAction(action, ctx);
    expect(createBlogPost).toHaveBeenCalledWith(expect.objectContaining({ content_domain: null, references: [] }));
  });
});

// ── FASE 3 (safe writes operacionais) ────────────────────────────────────

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "apt-1", client_id: "client-1", client_name: "Maria", client_phone: null, client_email: null,
    title: "Retorno", appointment_type: "retorno", starts_at: "2026-08-13T15:00:00.000Z", ends_at: "2026-08-13T16:00:00.000Z",
    status: "agendado", location: null, notes: null, portal_visible: 1, client_confirmed_at: null,
    cancellation_reason: null, created_at: "now", updated_at: "now",
    ...overrides,
  };
}

describe("executeProposedAction — reschedule_appointment", () => {
  const baseAction: ProposedAction = {
    kind: "reschedule_appointment", appointmentId: "apt-1", clientId: "client-1",
    previousStartsAtIso: "2026-08-13T15:00:00.000Z", newStartsAtDisplay: "14/08/2026 16:00",
    risk: "sensitive", requiresConfirmation: true,
  };

  it("reagenda com sucesso quando nada mudou desde a proposta", async () => {
    const updateAppointment = vi.fn();
    vi.doMock("@/lib/repositories/appointments", () => ({
      getAppointmentById: vi.fn().mockResolvedValue(appointmentRow()),
      updateAppointment,
    }));
    vi.doMock("@/lib/repositories/availability", () => ({
      hasAppointmentConflict: vi.fn().mockResolvedValue(false),
      slotEnd: vi.fn().mockImplementation((iso: string) => new Date(new Date(iso).getTime() + 60 * 60_000).toISOString()),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const result = await executeProposedAction(baseAction, ctx);
    expect(result.data).toMatchObject({ appointmentId: "apt-1", previousStartsAt: "2026-08-13T15:00:00.000Z" });
    expect(updateAppointment).toHaveBeenCalledWith("apt-1", expect.objectContaining({ starts_at: expect.any(String), ends_at: expect.any(String) }));
  });

  it("stale: horário mudou desde a proposta (reagendado por outra via) → 409, nunca aplica por cima", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({
      getAppointmentById: vi.fn().mockResolvedValue(appointmentRow({ starts_at: "2026-08-13T18:00:00.000Z" })),
      updateAppointment: vi.fn(),
    }));
    const { executeProposedAction, ProposalExecutionError } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
    await expect(executeProposedAction(baseAction, ctx)).rejects.toBeInstanceOf(ProposalExecutionError);
  });

  it("consulta não encontrada → 404", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(null), updateAppointment: vi.fn() }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 404 });
  });

  it("consulta não pertence ao paciente da proposta → 403 (nunca confia só no clientId do payload)", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({
      getAppointmentById: vi.fn().mockResolvedValue(appointmentRow({ client_id: "outro-cliente" })),
      updateAppointment: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 403 });
  });

  it("já cancelada → 409, nunca reagenda uma consulta cancelada", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({
      getAppointmentById: vi.fn().mockResolvedValue(appointmentRow({ status: "cancelado" })),
      updateAppointment: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it("novo horário em conflito com outra consulta → 409, nunca cria conflito de agenda", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({
      getAppointmentById: vi.fn().mockResolvedValue(appointmentRow()),
      updateAppointment: vi.fn(),
    }));
    vi.doMock("@/lib/repositories/availability", () => ({
      hasAppointmentConflict: vi.fn().mockResolvedValue(true),
      slotEnd: vi.fn().mockImplementation((iso: string) => new Date(new Date(iso).getTime() + 60 * 60_000).toISOString()),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
  });
});

describe("executeProposedAction — cancel_appointment", () => {
  const baseAction: ProposedAction = {
    kind: "cancel_appointment", appointmentId: "apt-1", clientId: "client-1",
    previousStatus: "agendado", cancellationReason: "Paciente pediu para remarcar depois.",
    risk: "sensitive", requiresConfirmation: true,
  };

  it("cancela com sucesso quando o status ainda bate com o snapshot da proposta", async () => {
    const updateAppointment = vi.fn();
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(appointmentRow()), updateAppointment }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const result = await executeProposedAction(baseAction, ctx);
    expect(result.data).toEqual({ appointmentId: "apt-1", previousStatus: "agendado", newStatus: "cancelado" });
    expect(updateAppointment).toHaveBeenCalledWith("apt-1", { status: "cancelado", cancellation_reason: "Paciente pediu para remarcar depois." });
  });

  it("stale: status mudou desde a proposta → 409", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(appointmentRow({ status: "confirmado" })), updateAppointment: vi.fn() }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it("já cancelada (confirmação duplicada/replay) → 409, nunca cancela duas vezes", async () => {
    const action: ProposedAction = { ...baseAction, previousStatus: "cancelado" };
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(appointmentRow({ status: "cancelado" })), updateAppointment: vi.fn() }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(action, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it("consulta não encontrada → 404", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(null), updateAppointment: vi.fn() }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 404 });
  });

  it("consulta não pertence ao paciente da proposta → 403", async () => {
    vi.doMock("@/lib/repositories/appointments", () => ({ getAppointmentById: vi.fn().mockResolvedValue(appointmentRow({ client_id: "outro-cliente" })), updateAppointment: vi.fn() }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 403 });
  });
});

describe("executeProposedAction — resolve_patient_request", () => {
  const baseAction: ProposedAction = {
    kind: "resolve_patient_request", requestId: "request-1", clientId: "client-1",
    previousStatus: "pending_review", newStatus: "resolved", adminNotes: "Combinado na consulta.",
    risk: "sensitive", requiresConfirmation: true,
  };

  function requestRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "request-1", client_id: "client-1", request_type: "food_substitution", patient_text: "Quero trocar arroz por batata.",
      ai_summary: null, meal_plan_id: null, meal_id: null, item_id: null, appointment_id: null, client_task_id: null,
      status: "pending_review", admin_notes: null, reviewed_at: null, created_at: "now", updated_at: "now",
      ...overrides,
    };
  }

  it("resolve com sucesso quando o status ainda é pending_review", async () => {
    const updatePatientRequestStatus = vi.fn().mockResolvedValue(requestRow({ status: "resolved" }));
    vi.doMock("@/lib/repositories/patient-requests", () => ({
      getPatientRequestById: vi.fn().mockResolvedValue(requestRow()),
      updatePatientRequestStatus,
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const result = await executeProposedAction(baseAction, ctx);
    expect(result.data).toEqual({ requestId: "request-1", previousStatus: "pending_review", newStatus: "resolved" });
    expect(updatePatientRequestStatus).toHaveBeenCalledWith("request-1", { status: "resolved", adminNotes: "Combinado na consulta." });
  });

  it("stale: outra via já revisou a solicitação → 409, nunca sobrescreve", async () => {
    vi.doMock("@/lib/repositories/patient-requests", () => ({
      getPatientRequestById: vi.fn().mockResolvedValue(requestRow({ status: "dismissed" })),
      updatePatientRequestStatus: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it("solicitação não encontrada → 404", async () => {
    vi.doMock("@/lib/repositories/patient-requests", () => ({ getPatientRequestById: vi.fn().mockResolvedValue(null), updatePatientRequestStatus: vi.fn() }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 404 });
  });

  it("solicitação não pertence ao paciente da proposta → 403", async () => {
    vi.doMock("@/lib/repositories/patient-requests", () => ({
      getPatientRequestById: vi.fn().mockResolvedValue(requestRow({ client_id: "outro-cliente" })),
      updatePatientRequestStatus: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 403 });
  });
});

describe("executeProposedAction — mark_payment_received", () => {
  const baseAction: ProposedAction = {
    kind: "mark_payment_received", paymentId: "pay-1", clientId: "client-1",
    previousStatus: "vencido", paidAtDisplay: "10/08/2026", notes: "Pago via Pix.",
    risk: "sensitive", requiresConfirmation: true,
  };

  function paymentRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "pay-1", client_id: "client-1", client_name: "Maria", client_email: null, description: "Consulta de retorno",
      amount_cents: 20000, due_date: "2026-08-01", paid_at: null, status: "vencido", payment_method: null,
      invoice_number: null, payment_link: null, receipt_url: null, installment_number: null, installment_total: null,
      category: null, notes: null, overdue_notified_at: null, created_at: "now", updated_at: "now",
      ...overrides,
    };
  }

  it("marca como recebido com sucesso, gravando a data informada", async () => {
    const updatePayment = vi.fn().mockResolvedValue(paymentRow({ status: "pago" }));
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(paymentRow()), updatePayment }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const result = await executeProposedAction(baseAction, ctx);
    expect(result.data).toEqual({ paymentId: "pay-1", previousStatus: "vencido", newStatus: "pago" });
    expect(updatePayment).toHaveBeenCalledWith("pay-1", expect.objectContaining({ status: "pago", paid_at: "2026-08-10T15:00:00.000Z", notes: "Pago via Pix." }));
  });

  it("sem paidAtDisplay, usa a data/hora atual", async () => {
    const updatePayment = vi.fn().mockResolvedValue(paymentRow({ status: "pago" }));
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(paymentRow()), updatePayment }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = { ...baseAction, paidAtDisplay: null };
    await executeProposedAction(action, ctx);
    expect(updatePayment).toHaveBeenCalledWith("pay-1", expect.objectContaining({ status: "pago" }));
  });

  it("stale: status mudou desde a proposta → 409", async () => {
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(paymentRow({ status: "pendente" })), updatePayment: vi.fn() }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it("já marcado como recebido (replay/duplicado) → 409, nunca marca duas vezes", async () => {
    const action: ProposedAction = { ...baseAction, previousStatus: "pago" };
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(paymentRow({ status: "pago" })), updatePayment: vi.fn() }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(action, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it("pagamento não encontrado → 404", async () => {
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(null), updatePayment: vi.fn() }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 404 });
  });

  it("pagamento não pertence ao paciente da proposta → 403", async () => {
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(paymentRow({ client_id: "outro-cliente" })), updatePayment: vi.fn() }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 403 });
  });

  it("data de recebimento inválida → 422", async () => {
    vi.doMock("@/lib/repositories/payments", () => ({ getPaymentById: vi.fn().mockResolvedValue(paymentRow()), updatePayment: vi.fn() }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const action: ProposedAction = { ...baseAction, paidAtDisplay: "não é uma data" };
    await expect(executeProposedAction(action, ctx)).rejects.toMatchObject({ status: 422 });
  });
});

describe("executeProposedAction — update_safe_substitutions_setting (FASE 5)", () => {
  const baseAction: ProposedAction = {
    kind: "update_safe_substitutions_setting",
    previousEnabled: false,
    newEnabled: true,
    risk: "sensitive",
    requiresConfirmation: true,
  };

  function settingsRow(overrides: Record<string, unknown> = {}) {
    return {
      provider: "openai", model: "gpt-4o", api_key: "sk-...abcd", has_api_key: true,
      patient_intake_mode: "smart", patient_safe_substitutions_enabled: false,
      chat_system_prompt: null, protocol_system_prompt: null, updated_at: "now",
      ...overrides,
    };
  }

  it("aplica a mudança quando o valor atual bate com o previousEnabled da proposta", async () => {
    const updateAISettings = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/repositories/ai-settings", () => ({
      getPublicAISettings: vi.fn().mockResolvedValue(settingsRow({ patient_safe_substitutions_enabled: false })),
      updateAISettings,
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    const result = await executeProposedAction(baseAction, ctx);
    expect(result.data).toEqual({ previousEnabled: false, newEnabled: true });
    expect(updateAISettings).toHaveBeenCalledWith({ patient_safe_substitutions_enabled: true });
  });

  it("stale: configuração mudou desde a proposta → 409, nunca aplica por cima", async () => {
    vi.doMock("@/lib/repositories/ai-settings", () => ({
      getPublicAISettings: vi.fn().mockResolvedValue(settingsRow({ patient_safe_substitutions_enabled: true })),
      updateAISettings: vi.fn(),
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
  });

  it("replay de proposta já confirmada (previousEnabled não bate mais) → 409, nunca reaplica", async () => {
    const updateAISettings = vi.fn();
    vi.doMock("@/lib/repositories/ai-settings", () => ({
      getPublicAISettings: vi.fn().mockResolvedValue(settingsRow({ patient_safe_substitutions_enabled: true })),
      updateAISettings,
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await expect(executeProposedAction(baseAction, ctx)).rejects.toMatchObject({ status: 409 });
    expect(updateAISettings).not.toHaveBeenCalled();
  });

  it("nunca escreve provider/model/api_key — só o campo patient_safe_substitutions_enabled", async () => {
    const updateAISettings = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/repositories/ai-settings", () => ({
      getPublicAISettings: vi.fn().mockResolvedValue(settingsRow({ patient_safe_substitutions_enabled: false })),
      updateAISettings,
    }));
    const { executeProposedAction } = await import("../lib/ai/core/proposal-handlers");
    await executeProposedAction(baseAction, ctx);
    expect(updateAISettings).toHaveBeenCalledWith({ patient_safe_substitutions_enabled: true });
    expect(updateAISettings.mock.calls[0][0]).not.toHaveProperty("api_key");
    expect(updateAISettings.mock.calls[0][0]).not.toHaveProperty("provider");
  });
});
