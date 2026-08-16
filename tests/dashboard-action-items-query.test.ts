import { beforeEach, describe, expect, it, vi } from "vitest";

const d1 = vi.hoisted(() => ({
  d1Query: vi.fn(),
}));

vi.mock("@/lib/d1/client", () => ({
  d1Query: d1.d1Query,
}));

describe("getDashboardActionItems workflow query", () => {
  beforeEach(() => {
    d1.d1Query.mockReset();
  });

  it("busca apenas workflows pendentes e agrega canais pela etapa lógica", async () => {
    d1.d1Query.mockImplementation(async (sql: string) => {
      if (sql.includes("appointment_workflow_items")) {
        return [
          {
            id: "workflow-email",
            appointment_id: "appt-1",
            step_type: "confirmacao",
            due_at: "2026-08-16T10:00:00.000Z",
            appointment_title: "Consulta inicial",
            starts_at: "2026-08-17T12:00:00.000Z",
            client_id: "client-1",
            client_name: "Ana",
          },
        ];
      }
      return [];
    });

    const { getDashboardActionItems } = await import("@/lib/dashboard/action-items");
    const items = await getDashboardActionItems(new Date("2026-08-16T12:00:00.000Z"));
    const workflowSql = d1.d1Query.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes("appointment_workflow_items"));

    expect(workflowSql).toContain("w.status = 'pendente'");
    expect(workflowSql).toContain("GROUP BY w.appointment_id, w.step_type");
    expect(workflowSql).toContain("MIN(w.due_at)");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "workflow-due:workflow-email",
      sourceId: "workflow-email",
      href: "/dashboard/agenda",
      priority: "NORMAL",
    });
  });
});
