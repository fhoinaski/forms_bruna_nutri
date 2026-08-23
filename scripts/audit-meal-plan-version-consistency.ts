import { createHash } from "node:crypto";
import { d1Query } from "../lib/d1/client";

type PlanRow = {
  id: string;
  client_id: string;
  status: string;
  version: number;
  updated_at: string;
};

type QuantityRow = {
  meal_plan_id: string;
  food: string;
  quantity: string | null;
  unit: string | null;
};

function hashQuantities(rows: QuantityRow[]): string {
  const payload = rows
    .map((row) => [row.meal_plan_id, row.food, row.quantity ?? "", row.unit ?? ""].join("|"))
    .sort()
    .join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

async function main() {
  const [mode, id] = process.argv.slice(2);
  if ((mode !== "--client" && mode !== "--plan") || !id) {
    console.error("Uso: tsx scripts/audit-meal-plan-version-consistency.ts --client <clientId> | --plan <planId>");
    process.exit(1);
  }

  const plans = mode === "--client"
    ? await d1Query<PlanRow>("SELECT id, client_id, status, version, updated_at FROM meal_plans WHERE client_id = ?1 ORDER BY status, version DESC", [id])
    : await d1Query<PlanRow>("SELECT id, client_id, status, version, updated_at FROM meal_plans WHERE id = ?1", [id]);

  const planIds = plans.map((plan) => plan.id);
  const quantities = planIds.length
    ? await d1Query<QuantityRow>(
        `SELECT p.id as meal_plan_id, i.food, i.quantity, i.unit
           FROM meal_plans p
           JOIN meal_plan_meals m ON m.meal_plan_id = p.id
           JOIN meal_plan_items i ON i.meal_id = m.id
          WHERE p.id IN (${planIds.map((_, index) => `?${index + 1}`).join(",")})
          ORDER BY p.id, m.sort_order, i.sort_order`,
        planIds
      )
    : [];

  const byPlan = new Map<string, QuantityRow[]>();
  for (const row of quantities) byPlan.set(row.meal_plan_id, [...(byPlan.get(row.meal_plan_id) ?? []), row]);
  const active = plans.filter((plan) => plan.status === "active");

  console.log(JSON.stringify({
    scope: mode === "--client" ? "client" : "plan",
    id,
    activeVersionIds: active.map((plan) => `${plan.id}:v${plan.version}`),
    draftVersionIds: plans.filter((plan) => plan.status === "draft").map((plan) => `${plan.id}:v${plan.version}`),
    activeCount: active.length,
    versions: plans.map((plan) => ({
      planId: plan.id,
      versionId: `${plan.id}:v${plan.version}`,
      status: plan.status,
      versionNumber: plan.version,
      itemCount: byPlan.get(plan.id)?.length ?? 0,
      quantitiesHash: hashQuantities(byPlan.get(plan.id) ?? []),
      updatedAt: plan.updated_at,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
