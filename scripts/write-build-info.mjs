// Clinical Copilot R1.2.6 (seção 1-3) — grava, DENTRO do artefato de build
// que o `next start` do E2E realmente serve, o git SHA e o timestamp de
// build no momento em que este build foi gerado. Corre como `postbuild`
// (depois de `next build`), então .next/BUILD_ID já existe.
//
// Serve pra provar, em runtime, que o servidor E2E (`next start`) está
// executando o changeset atual — não um `.next` obsoleto de um build
// anterior (a causa raiz confirmada na R1.2.5). Um script test-only lê o
// SHA atual do git e compara com o valor gravado aqui; qualquer
// divergência significa build obsoleto, não bug de produto.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = join(root, ".next");
const buildIdPath = join(nextDir, "BUILD_ID");
const outPath = join(nextDir, "e2e-build-info.json");

function gitSha() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
  } catch {
    return null;
  }
}

function main() {
  if (!existsSync(buildIdPath)) {
    console.warn("[write-build-info] .next/BUILD_ID não encontrado — pulando (build sem output standalone?).");
    return;
  }
  const buildId = readFileSync(buildIdPath, "utf8").trim();
  const info = {
    buildId,
    gitSha: gitSha(),
    builtAt: new Date().toISOString(),
  };
  mkdirSync(nextDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(info, null, 2));
  console.log(`[write-build-info] BUILD_ID=${info.buildId} gitSha=${info.gitSha ?? "N-A"} builtAt=${info.builtAt}`);
}

main();
