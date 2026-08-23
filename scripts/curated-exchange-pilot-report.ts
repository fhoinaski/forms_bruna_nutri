import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { d1Query } from "@/lib/d1/client";

type AuditRow = {
  action: string;
  entity_id: string | null;
  metadata_json: string | null;
  created_at: string;
};

type GroupRow = {
  id: string;
  primary_food_name: string;
  exchange_generation_mode: string | null;
};

type Metadata = Record<string, unknown>;

type PilotMetrics = {
  itemsGenerated: number;
  itemsReviewed: number;
  suggestionsShown: number;
  approved: number;
  rejected: number;
  editedAndKept: number;
  manualAdded: number;
  regenerated: number;
  deletedAllSuggestions: number;
  globalRankRequested: number;
  globalRankFallback: number;
  pilotOnlyApproved: number;
  usefulSuggestionRate: number | null;
  manualInterventionRate: number | null;
  firstPassAcceptanceRate: number | null;
  approvalRate: number | null;
  rejectionRate: number | null;
  manualReplacementRate: number | null;
  regenerationRate: number | null;
  averageApprovedPerItem: number | null;
  averageSuggestedPerItem: number | null;
  fallbackRate: number | null;
  fallbackByCategory: Record<string, number>;
  rejectedByReason: Record<string, number>;
};

const GENERATION_ACTIONS = new Set(["SUGGESTION_SHOWN", "ALTERNATIVES_REGENERATED"]);
const REVIEW_ACTIONS = new Set(["SUGGESTION_APPROVED", "SUGGESTION_REJECTED", "SUGGESTION_EDITED", "SUGGESTION_REPLACED_MANUALLY"]);

function parseArgs(argv: string[]) {
  const args: { from?: string; to?: string; out: string } = { out: "reports/curated-exchange-pilot-usage.md" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") args.from = argv[++i];
    else if (arg.startsWith("--from=")) args.from = arg.slice("--from=".length);
    else if (arg === "--to") args.to = argv[++i];
    else if (arg.startsWith("--to=")) args.to = arg.slice("--to=".length);
    else if (arg === "--out") args.out = argv[++i] ?? args.out;
    else if (arg.startsWith("--out=")) args.out = arg.slice("--out=".length);
  }
  return args;
}

function metadata(row: AuditRow): Metadata {
  if (!row.metadata_json) return {};
  try {
    const parsed = JSON.parse(row.metadata_json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function inc(map: Record<string, number>, key: string | null | undefined, by = 1) {
  const normalized = key || "OTHER";
  map[normalized] = (map[normalized] ?? 0) + by;
}

export function calculatePilotMetrics(rows: AuditRow[]): PilotMetrics {
  const generations = rows.filter((row) => GENERATION_ACTIONS.has(row.action));
  const reviews = rows.filter((row) => REVIEW_ACTIONS.has(row.action));
  const generationByGroup = new Map<string, Metadata>();
  const reviewedGroups = new Set<string>();
  const firstPassApprovedGroups = new Set<string>();
  const regeneratedGroups = new Set<string>();
  const fallbackByCategory: Record<string, number> = {};
  const rejectedByReason: Record<string, number> = {};
  let suggestionsShown = 0;
  let approved = 0;
  let rejected = 0;
  let editedAndKept = 0;
  let manualAdded = 0;
  let deletedAllSuggestions = 0;
  let globalRankRequested = 0;
  let globalRankFallback = 0;
  let pilotOnlyApproved = 0;

  for (const row of generations) {
    const meta = metadata(row);
    const groupId = String(meta.exchangeGroupId ?? row.entity_id ?? "");
    if (groupId) generationByGroup.set(groupId, meta);
    suggestionsShown += num(meta.candidateCount);
    if (row.action === "ALTERNATIVES_REGENERATED" && groupId) regeneratedGroups.add(groupId);
    if (meta.strategyRequested === "CURATED_ELIGIBILITY_GLOBAL_RANK") {
      globalRankRequested++;
      if (meta.strategyUsed === "ENGINE_ONLY") {
        globalRankFallback++;
        inc(fallbackByCategory, String(meta.fallbackCategory ?? meta.fallbackReason ?? "OTHER"));
      }
    }
  }

  for (const row of reviews) {
    const meta = metadata(row);
    const groupId = String(meta.exchangeGroupId ?? row.entity_id ?? "");
    if (groupId) reviewedGroups.add(groupId);
    if (row.action === "SUGGESTION_APPROVED") {
      const count = num(meta.approvedCount) || num(meta.reviewedSuggestionCount);
      approved += count;
      if (groupId && !regeneratedGroups.has(groupId)) firstPassApprovedGroups.add(groupId);
      const generation = generationByGroup.get(groupId);
      const engineRefs = new Set(stringArray(generation?.engineShadowCandidateRefs));
      for (const ref of stringArray(meta.reviewedCandidateRefs)) {
        if (generation?.strategyUsed === "CURATED_ELIGIBILITY_GLOBAL_RANK" && !engineRefs.has(ref)) pilotOnlyApproved++;
      }
    } else if (row.action === "SUGGESTION_REJECTED") {
      rejected += num(meta.rejectedCount) || num(meta.reviewedSuggestionCount);
      inc(rejectedByReason, typeof meta.rejectionReason === "string" ? meta.rejectionReason : "UNSPECIFIED");
    } else if (row.action === "SUGGESTION_EDITED") {
      editedAndKept += num(meta.editedCount) || num(meta.reviewedSuggestionCount);
    } else if (row.action === "SUGGESTION_REPLACED_MANUALLY") {
      manualAdded += num(meta.manuallyAddedCount);
      if (meta.deletedAllSuggestions === true) deletedAllSuggestions++;
    }
  }

  const reviewedSuggestions = approved + rejected + editedAndKept;
  const itemsGenerated = generations.length;
  const manualInterventions = manualAdded + regeneratedGroups.size + deletedAllSuggestions;

  return {
    itemsGenerated,
    itemsReviewed: reviewedGroups.size,
    suggestionsShown,
    approved,
    rejected,
    editedAndKept,
    manualAdded,
    regenerated: regeneratedGroups.size,
    deletedAllSuggestions,
    globalRankRequested,
    globalRankFallback,
    pilotOnlyApproved,
    usefulSuggestionRate: ratio(approved + editedAndKept, reviewedSuggestions),
    manualInterventionRate: ratio(manualInterventions, itemsGenerated),
    firstPassAcceptanceRate: ratio(firstPassApprovedGroups.size, reviewedGroups.size),
    approvalRate: ratio(approved, reviewedSuggestions),
    rejectionRate: ratio(rejected, reviewedSuggestions),
    manualReplacementRate: ratio(manualAdded, itemsGenerated),
    regenerationRate: ratio(regeneratedGroups.size, itemsGenerated),
    averageApprovedPerItem: ratio(approved, itemsGenerated),
    averageSuggestedPerItem: ratio(suggestionsShown, itemsGenerated),
    fallbackRate: ratio(globalRankFallback, globalRankRequested),
    fallbackByCategory,
    rejectedByReason,
  };
}

function formatRate(value: number | null) {
  return value === null ? "n/a" : `${Math.round(value * 1000) / 10}%`;
}

function fencedJson(value: unknown) {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

function wholePlanRows(rows: AuditRow[], groups: Map<string, GroupRow>) {
  const byGroup = new Map<string, { meal: string; suggested: number; approved: number; rejected: number; manual: number; strategyUsed: string }>();
  for (const row of rows) {
    const meta = metadata(row);
    const groupId = String(meta.exchangeGroupId ?? row.entity_id ?? "");
    if (!groupId) continue;
    const current = byGroup.get(groupId) ?? {
      meal: String(meta.mealContext ?? "UNKNOWN"),
      suggested: 0,
      approved: 0,
      rejected: 0,
      manual: 0,
      strategyUsed: String(meta.strategyUsed ?? groups.get(groupId)?.exchange_generation_mode ?? "UNKNOWN"),
    };
    if (GENERATION_ACTIONS.has(row.action)) current.suggested = Math.max(current.suggested, num(meta.candidateCount));
    if (row.action === "SUGGESTION_APPROVED") current.approved += num(meta.approvedCount) || num(meta.reviewedSuggestionCount);
    if (row.action === "SUGGESTION_REJECTED") current.rejected += num(meta.rejectedCount) || num(meta.reviewedSuggestionCount);
    if (row.action === "SUGGESTION_REPLACED_MANUALLY") current.manual += num(meta.manuallyAddedCount) + (meta.deletedAllSuggestions === true ? 1 : 0);
    byGroup.set(groupId, current);
  }
  return Array.from(byGroup.entries()).map(([groupId, row]) => ({
    meal: row.meal,
    primary: groups.get(groupId)?.primary_food_name ?? "Unknown food",
    suggested: row.suggested,
    approved: row.approved,
    rejected: row.rejected,
    manual: row.manual,
    strategyUsed: row.strategyUsed,
  }));
}

async function loadAuditRows(from?: string, to?: string): Promise<AuditRow[]> {
  const where = ["action IN ('SUGGESTION_SHOWN','SUGGESTION_APPROVED','SUGGESTION_REJECTED','SUGGESTION_EDITED','SUGGESTION_REPLACED_MANUALLY','ALTERNATIVES_REGENERATED')"];
  const params: unknown[] = [];
  if (from) {
    params.push(from);
    where.push(`created_at >= ?${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`created_at <= ?${params.length}`);
  }
  return d1Query<AuditRow>(
    `SELECT action, entity_id, metadata_json, created_at FROM admin_audit_logs WHERE ${where.join(" AND ")} ORDER BY created_at ASC LIMIT 5000`,
    params
  );
}

async function loadGroups(groupIds: string[]) {
  if (!groupIds.length) return new Map<string, GroupRow>();
  const placeholders = groupIds.map((_, index) => `?${index + 1}`).join(",");
  const rows = await d1Query<GroupRow>(
    `SELECT id, primary_food_name, exchange_generation_mode FROM exchange_groups WHERE id IN (${placeholders})`,
    groupIds
  );
  return new Map(rows.map((row) => [row.id, row]));
}

function renderReport(input: {
  from?: string;
  to?: string;
  generatedAt: string;
  metrics: PilotMetrics;
  rows: Array<{ meal: string; primary: string; suggested: number; approved: number; rejected: number; manual: number; strategyUsed: string }>;
  warning?: string;
}) {
  const lines = [
    "# Curated Exchange Pilot Usage",
    "",
    `Generated at: ${input.generatedAt}`,
    `Period from: ${input.from ?? "beginning"}`,
    `Period to: ${input.to ?? "now"}`,
    "",
    "Privacy: this report excludes patient name, email, diagnosis, anamnesis, notes and full plan text.",
  ];
  if (input.warning) lines.push("", `Warning: ${input.warning}`);
  lines.push(
    "",
    "## Metrics",
    "",
    `Items generated: ${input.metrics.itemsGenerated}`,
    `Items reviewed: ${input.metrics.itemsReviewed}`,
    `Useful suggestion rate: ${formatRate(input.metrics.usefulSuggestionRate)}`,
    `Manual intervention rate: ${formatRate(input.metrics.manualInterventionRate)}`,
    `First-pass acceptance rate: ${formatRate(input.metrics.firstPassAcceptanceRate)}`,
    `Approval rate: ${formatRate(input.metrics.approvalRate)}`,
    `Rejection rate: ${formatRate(input.metrics.rejectionRate)}`,
    `Manual replacement rate: ${formatRate(input.metrics.manualReplacementRate)}`,
    `Regeneration rate: ${formatRate(input.metrics.regenerationRate)}`,
    `Average approved per item: ${input.metrics.averageApprovedPerItem ?? "n/a"}`,
    `Average suggested per item: ${input.metrics.averageSuggestedPerItem ?? "n/a"}`,
    `Fallback rate: ${formatRate(input.metrics.fallbackRate)}`,
    `Pilot-only approved candidates: ${input.metrics.pilotOnlyApproved}`,
    "",
    "## Fallback By Category",
    "",
    fencedJson(input.metrics.fallbackByCategory),
    "",
    "## Rejection Reasons",
    "",
    fencedJson(input.metrics.rejectedByReason),
    "",
    "## Whole Plan Review Rows",
    "",
    "| Meal | Primary | Suggested | Approved | Rejected | Manual | StrategyUsed |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- |",
    ...input.rows.map((row) => `| ${row.meal} | ${row.primary.replaceAll("|", " ")} | ${row.suggested} | ${row.approved} | ${row.rejected} | ${row.manual} | ${row.strategyUsed} |`),
    "",
    "## Interpretation",
    "",
    "- Do not treat fallback as an error by itself.",
    "- Do not recommend ON before enough real or controlled review volume exists.",
    "- If no baseline exists, use the first pilot period as baseline."
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let rows: AuditRow[] = [];
  let warning: string | undefined;
  try {
    rows = await loadAuditRows(args.from, args.to);
  } catch (error) {
    warning = error instanceof Error ? error.message : "Could not query audit logs.";
  }
  const groupIds = Array.from(new Set(rows.map((row) => String(metadata(row).exchangeGroupId ?? row.entity_id ?? "")).filter(Boolean)));
  const groups = warning ? new Map<string, GroupRow>() : await loadGroups(groupIds).catch(() => new Map<string, GroupRow>());
  const metrics = calculatePilotMetrics(rows);
  const report = renderReport({
    from: args.from,
    to: args.to,
    generatedAt: new Date().toISOString(),
    metrics,
    rows: wholePlanRows(rows, groups),
    warning,
  });
  const out = resolve(args.out);
  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(out, report);
  console.log(`Curated exchange pilot report written to ${args.out}`);
}

if (process.argv[1]?.endsWith("curated-exchange-pilot-report.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
