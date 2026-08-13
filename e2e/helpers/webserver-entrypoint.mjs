// Entrypoint usado por playwright.config.ts como `webServer.command`.
//
// Responsabilidade: subir o shim local de D1 (d1-shim.mjs) ANTES do
// servidor Next.js, apontar as env vars de D1 para o shim, semear os
// admins minimos necessarios para autenticar (bootstrap — nao ha como criar
// um admin via API sem ja estar autenticado), e so entao subir `next
// start`, repassando sinais e limpando o shim ao sair.
//
// Isso garante — independente de como o Playwright ordena globalSetup vs
// webServer — que o processo Next.js SEMPRE recebe CLOUDFLARE_D1_API_BASE_URL
// apontando para o shim antes de fazer sua primeira query, nunca para a
// Cloudflare real.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { startD1Shim } from "./d1-shim.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturesPath = join(root, "e2e", ".tmp", "admin-fixtures.json");

const TEST_AUTH_SECRET = "e2e-test-auth-secret-do-not-use-in-production-32ch";

const ADMIN = {
  id: "e2e-admin-default",
  name: "Bruna E2E",
  email: "e2e-admin@test.local",
  password: "E2eAdmin!2026Senha",
  mustChangePassword: 0,
};

// adminMustChange/adminMfaCandidate sao mutados PARA VALER pelos proprios
// testes que os usam (troca de senha real, ativacao real de MFA) — uma
// unica conta compartilhada entre os projetos do Playwright (chromium-desktop
// e mobile-chrome, rodando em paralelo contra o MESMO servidor/banco) fazia
// o projeto que roda por ultimo herdar o estado ja mutado pelo primeiro
// (ex.: senha ja trocada), falhando login com "credenciais invalidas" de
// forma legitima, mas por colisao de fixture, nao por bug de app. Cada
// projeto ganha sua PROPRIA copia isolada dessas duas contas.
const PROJECT_NAMES = ["chromium-desktop", "mobile-chrome"];

function buildProjectAdmins(projectName) {
  return {
    adminMustChange: {
      id: `e2e-admin-mustchange-${projectName}`,
      name: "Admin Novo E2E",
      email: `e2e-admin-mustchange-${projectName}@test.local`,
      password: "E2eTemp!2026Senha",
      mustChangePassword: 1,
    },
    adminMfaCandidate: {
      id: `e2e-admin-mfa-${projectName}`,
      name: "Admin MFA E2E",
      email: `e2e-admin-mfa-${projectName}@test.local`,
      password: "E2eMfa!2026Senha",
      mustChangePassword: 0,
    },
  };
}

const BY_PROJECT = Object.fromEntries(PROJECT_NAMES.map((name) => [name, buildProjectAdmins(name)]));

async function seedAdmins(db) {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO admin_users (id, name, email, password_hash, must_change_password, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`
  );
  const allAdmins = [ADMIN, ...PROJECT_NAMES.flatMap((name) => [BY_PROJECT[name].adminMustChange, BY_PROJECT[name].adminMfaCandidate])];
  for (const admin of allAdmins) {
    const passwordHash = await bcrypt.hash(admin.password, 10);
    insert.run(admin.id, admin.name, admin.email, passwordHash, admin.mustChangePassword, now);
  }
}

async function seedAiSettings(db) {
  // Pré-consulta em modo inteligente, MAS SEM api_key real (para não interferir
  // no teste que garante que o chat admin/portal nunca responde sem provedor).
  // A disponibilidade do intake sob o executor determinístico é resolvida por
  // resolvePublicPreConsultationMode() — sem exigir chave.
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_settings
       (id, provider, api_key, model, protocol_system_prompt, chat_system_prompt,
        patient_intake_mode, updated_at)
     VALUES ('default', 'openai', NULL, 'gpt-4o', NULL, NULL, 'smart', ?1)
     ON CONFLICT(id) DO UPDATE SET
       api_key = NULL,
       patient_intake_mode = 'smart'`
  ).run(now);
}

async function main() {
  const shim = await startD1Shim();
  await seedAdmins(shim.db);
  await seedAiSettings(shim.db);

  mkdirSync(dirname(fixturesPath), { recursive: true });
  writeFileSync(
    fixturesPath,
    JSON.stringify({ admin: ADMIN, byProject: BY_PROJECT }, null, 2)
  );

  const env = {
    ...process.env,
    CLOUDFLARE_D1_API_BASE_URL: shim.baseUrl,
    CLOUDFLARE_ACCOUNT_ID: "e2e-account",
    CLOUDFLARE_D1_DATABASE_ID: "e2e-database",
    CLOUDFLARE_D1_API_TOKEN: "e2e-token",
    AUTH_SECRET: process.env.AUTH_SECRET || TEST_AUTH_SECRET,
    MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY || TEST_AUTH_SECRET,
    CLINICAL_DATA_ENCRYPTION_KEY: process.env.CLINICAL_DATA_ENCRYPTION_KEY || TEST_AUTH_SECRET,
    BACKUP_ENCRYPTION_KEY: process.env.BACKUP_ENCRYPTION_KEY || TEST_AUTH_SECRET,
    PATIENT_INTAKE_SESSION_SECRET: process.env.PATIENT_INTAKE_SESSION_SECRET || `${TEST_AUTH_SECRET}-intake`,
    // Fake determinístico para o Intake Agent — substitui o executor do agente
    // (lib/ai/agents/patient/intake/intake-agent.ts) por respostas previsíveis
    // por campo, SEM depender de OpenAI/DeepSeek/Anthropic. Só tem efeito sob
    // E2E_TEST_MODE=1 (o executor resolve para o gateway real em qualquer
    // outro ambiente) — não há backdoor público.
    INTAKE_AI_TEST_PROVIDER: "deterministic",
    // Sem provedor de IA real configurado: os fluxos que dependem de LLM
    // devolvem AiConfigError de forma graciosa (comportamento ja existente
    // e testado) — os testes de IA seedam proposals diretamente, nunca
    // dependem de uma chamada paga/nao deterministica a um provedor real.
    NODE_ENV: "production",
    // Habilita apenas app/api/admin/ai/proposals/test-seed/route.ts (404 em
    // qualquer outro ambiente) — permite provar o gate proposta->confirmacao
    // ponta a ponta pelas rotas HTTP reais sem um provedor de IA configurado.
    E2E_TEST_MODE: "1",
  };

  console.log(`[e2e] D1 shim up on ${shim.baseUrl} (${shim.migrationCount} migrations aplicadas).`);
  console.log(`[e2e] Admins semeados: ${ADMIN.email}, ${PROJECT_NAMES.map((name) => BY_PROJECT[name].adminMustChange.email).join(", ")}, ${PROJECT_NAMES.map((name) => BY_PROJECT[name].adminMfaCandidate.email).join(", ")}`);

  const child = spawn("npm", ["run", "start"], { cwd: root, env, stdio: "inherit", shell: true });

  // `shell:true` no Windows cria uma arvore de processos (cmd.exe -> npm.cmd
  // -> node next-server) — child.kill() so mata o cmd.exe, deixando o
  // next-server orfao e a porta 3000 presa para a proxima execucao. Usa
  // taskkill /T (mata a arvore inteira) no Windows; SIGTERM normal no
  // grupo de processos em POSIX.
  function killTree() {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
  }

  let shuttingDown = false;
  const shutdown = async (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    await shim.close();
    process.exit(code ?? 0);
  };

  child.on("exit", (code) => void shutdown(code));
  process.on("SIGINT", killTree);
  process.on("SIGTERM", killTree);
}

main().catch((error) => {
  console.error("[e2e] Falha ao subir o ambiente de E2E:", error);
  process.exit(1);
});
