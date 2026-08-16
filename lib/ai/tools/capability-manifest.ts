import type { AssistantCapabilityProfile } from "@/lib/ai/policies/permissions";
import type { ToolRisk } from "@/lib/ai/policies/action-policy";
import { canAutoExecute, requiresConfirmation } from "@/lib/ai/policies/action-policy";
import { listRegisteredTools } from "@/lib/ai/tools/registry";
import { AGENT_DOMAINS, type AgentDomain, type ToolEntityType } from "@/lib/ai/tools/capability-types";

/**
 * Fonte de verdade unica e derivada (nunca mantida a mao em paralelo) das
 * capacidades do assistente, gerada a partir do tool registry
 * (lib/ai/tools/registry.ts). Existe para que documentacao e descoberta de
 * capacidades nunca fiquem desatualizadas em relacao ao codigo — ver
 * docs/AI-SYSTEM-INTEGRATION.md.
 */
export interface CapabilityManifestEntry {
  name: string;
  description: string;
  domain: AgentDomain;
  entityTypes: readonly ToolEntityType[];
  risk: ToolRisk;
  profiles: readonly AssistantCapabilityProfile[];
  contextRequirement: "none" | "client" | "submission";
  requiresConfirmation: boolean;
  autoExecutes: boolean;
}

export interface CapabilityManifest {
  generatedAt: string;
  domains: Record<AgentDomain, CapabilityManifestEntry[]>;
}

export function buildCapabilityManifest(): CapabilityManifest {
  const domains = Object.fromEntries(
    AGENT_DOMAINS.map((d) => [d, [] as CapabilityManifestEntry[]])
  ) as Record<AgentDomain, CapabilityManifestEntry[]>;

  for (const tool of listRegisteredTools()) {
    domains[tool.domain].push({
      name: tool.name,
      description: tool.description,
      domain: tool.domain,
      entityTypes: tool.entityTypes,
      risk: tool.risk,
      profiles: tool.profiles,
      contextRequirement: tool.contextRequirement,
      requiresConfirmation: requiresConfirmation(tool.risk),
      autoExecutes: canAutoExecute(tool.risk),
    });
  }

  return { generatedAt: new Date().toISOString(), domains };
}

/** Lista os dominios que ainda nao tem nenhuma tool registrada — gaps de cobertura. */
export function listUncoveredDomains(): AgentDomain[] {
  const covered = new Set(listRegisteredTools().map((t) => t.domain));
  return AGENT_DOMAINS.filter((d) => !covered.has(d));
}
