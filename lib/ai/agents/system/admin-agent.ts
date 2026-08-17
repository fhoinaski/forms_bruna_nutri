import { z } from "zod";
import { listAuditLogs } from "@/lib/security/audit";

/**
 * FASE 5 (document/configuration/admin) — domínio "admin". Auditoria
 * confirmou: sistema de admin ÚNICO (a própria nutricionista logada), sem
 * RBAC/múltiplos usuários administrativos — não existe rota nem repository
 * de "listar todos os admins" (só get por id/email). Por isso não há uma
 * tool "getUsers": a resposta correta para "quem são os usuários
 * administrativos" é uma informação estática (ver instruções abaixo), não
 * uma consulta ao banco.
 *
 * Cobertos aqui: status de saúde do sistema (mesma checagem determinística
 * de app/api/health/route.ts, nunca uma segunda fonte de verdade) e um
 * resumo do audit log (lib/security/audit.ts#listAuditLogs, já existente) —
 * ambos SOMENTE LEITURA. Nunca expõe password_hash, mfa_secret_encrypted,
 * recovery_codes_json, api_key, nem qualquer outro segredo/hash/token.
 */

// ── get_system_health (READ) ──────────────────────────────────────────────

export const GET_SYSTEM_HEALTH_TOOL_NAME = "getSystemHealth";
export const getSystemHealthInputSchema = z.object({}).strict();

/** Mesmas 4 variáveis checadas por app/api/health/route.ts — nunca uma segunda fonte de verdade sobre o que é "obrigatório". */
const REQUIRED_ENVIRONMENT_KEYS = ["AUTH_SECRET", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_D1_API_TOKEN"] as const;

export async function executeGetSystemHealth() {
  const missing = REQUIRED_ENVIRONMENT_KEYS.filter((key) => !process.env[key]);
  return {
    ok: missing.length === 0,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    missingEnvironmentVariables: missing,
    checkedAt: new Date().toISOString(),
  };
}

// ── get_audit_log_summary (READ) ──────────────────────────────────────────

export const GET_AUDIT_LOG_SUMMARY_TOOL_NAME = "getAuditLogSummary";
export const getAuditLogSummaryInputSchema = z.object({
  limit: z.number().int().positive().max(50).optional(),
}).strict();
export type GetAuditLogSummaryInput = z.infer<typeof getAuditLogSummaryInputSchema>;

/**
 * Nunca devolve `metadata_json` cru (o shape varia por `action` e pode
 * conter dado não genericamente seguro, item 11 do pedido) nem `ip_hash`
 * (sem valor para o LLM, so superficie de correlacao a menos).
 */
export async function executeGetAuditLogSummary(input: GetAuditLogSummaryInput) {
  const logs = await listAuditLogs(input.limit ?? 20);
  return {
    entries: logs.map((log) => ({
      action: log.action,
      entityType: log.entity_type,
      outcome: log.outcome,
      createdAt: log.created_at,
    })),
    totalFound: logs.length,
  };
}

export const ADMIN_ASSISTANT_INSTRUCTIONS = `
Voce tambem pode consultar informacoes administrativas do sistema, sempre so leitura.
Como fazer isso:
- Para "o sistema esta saudavel/funcionando", use ${GET_SYSTEM_HEALTH_TOOL_NAME} — nunca afirme que o sistema esta ok sem checar.
- Para "o que aconteceu recentemente no sistema" ou um resumo de atividade administrativa, use ${GET_AUDIT_LOG_SUMMARY_TOOL_NAME}.
- Este sistema tem um UNICO administrador (a propria nutricionista logada nesta conversa) — nao existe gestao de multiplos usuarios administrativos nem papeis/permissoes diferentes. Se perguntarem "quem sao os usuarios administrativos", responda isso diretamente, sem chamar nenhuma ferramenta.
- Nunca revele senha, hash, chave de criptografia, segredo de MFA, codigo de recuperacao ou qualquer credencial — nenhuma ferramenta aqui devolve isso, e voce nunca deve inventar um valor desses.
`.trim();
