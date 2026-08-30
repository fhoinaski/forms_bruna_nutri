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
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = join(root, ".next");
const buildIdPath = join(nextDir, "BUILD_ID");
const buildManifestPath = join(nextDir, "build-manifest.json");
const outPath = join(nextDir, "e2e-build-info.json");

function gitSha() {
  try {
    return execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
  } catch {
    return null;
  }
}

function main() {
  // Turbopack in Next 16 no longer emits .next/BUILD_ID for this output mode.
  // Keep the E2E freshness contract by deriving a stable identifier from a
  // required build artifact rather than treating an old Next convention as a failure.
  const manifest = existsSync(buildManifestPath) ? readFileSync(buildManifestPath) : null;
  const buildId = existsSync(buildIdPath)
    ? readFileSync(buildIdPath, "utf8").trim()
    : manifest
      ? `manifest-${createHash("sha256").update(manifest).digest("hex").slice(0, 16)}`
      : null;
  if (!buildId) throw new Error("[write-build-info] nenhum artefato de build identificável foi produzido.");
  // Next 16.3 Turbopack omitted this legacy file, but `next start` still
  // requires it for the repository's production E2E server contract.
  if (!existsSync(buildIdPath)) writeFileSync(buildIdPath, `${buildId}\n`);
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
