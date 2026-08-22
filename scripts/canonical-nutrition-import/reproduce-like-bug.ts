#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0 || line.trimStart().startsWith("#")) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

/**
 * FASE 4.5 (item 1) — reproducao empirica do bug real contra o D1 de
 * verdade (node:sqlite local NAO reproduz: testado ate 10.000 caracteres
 * sem erro — o limite e especifico da plataforma D1/Cloudflare, nao do
 * SQLite generico). Ferramenta de diagnostico manual, nunca parte do CI
 * (precisa de rede/credenciais reais) — os testes automatizados
 * (tests/usda-foods-like-safety.test.ts) validam a LOGICA da correcao sem
 * depender de rede.
 */
async function main() {
  const { d1Query } = await import("@/lib/d1/client");

  console.log("=== Binary search do limite real de padrao LIKE no D1 ===");
  for (let len = 40; len <= 60; len += 2) {
    const text = "x".repeat(len);
    try {
      await d1Query("SELECT 1 FROM food_catalog_usda_foods WHERE normalized_name LIKE ?1 LIMIT 1", [`%${text}%`]);
      console.log(`  padrao com ${len + 2} chars totais (%...%): OK`);
    } catch (error) {
      console.log(`  padrao com ${len + 2} chars totais (%...%): FALHA — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("\n=== Reproducao com nome real da TBCA (shadow dataset Fase 4) ===");
  const realTbcaName =
    "Papa de carne bovina moída (acém), arroz branco e brócolis, c/ caldo de carne, c/ cebola, s/ óleo, c/ sal"
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  console.log(`Query normalizada (${realTbcaName.length} chars): "${realTbcaName}"`);
  try {
    await d1Query("SELECT 1 FROM food_catalog_usda_foods WHERE normalized_name LIKE ?1 LIMIT 1", [`%${realTbcaName}%`]);
    console.log("OK (inesperado — deveria falhar sem a correcao)");
  } catch (error) {
    console.log(`FALHA (reproduzido): ${error instanceof Error ? error.message : String(error)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
