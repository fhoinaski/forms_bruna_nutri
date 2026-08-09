import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sourcePath = join(root, "lib", "clinical", "data", "source", "who-growth-reference-raw.json");
const outputPath = join(root, "lib", "clinical", "data", "who-growth-lms.json");

const raw = JSON.parse(readFileSync(sourcePath, "utf8"));

function axisKeyOf(point) {
  if ("dia" in point) return "dia";
  if ("idade_meses" in point) return "idade_meses";
  if ("altura_cm" in point) return "altura_cm";
  if ("cm" in point) return "altura_cm";
  throw new Error(`Ponto LMS sem eixo reconhecido: ${JSON.stringify(point).slice(0, 120)}`);
}

function reduceCurve(curve) {
  if (!Array.isArray(curve) || curve.length === 0) return { axis: "dia", points: [] };
  const axis = axisKeyOf(curve[0]);
  return {
    axis,
    points: curve.map((point) => ({
      axis: Number(point[axis === "altura_cm" ? ("altura_cm" in point ? "altura_cm" : "cm") : axis]),
      l: Number(point.lms.l),
      m: Number(point.lms.m),
      s: Number(point.lms.s),
    })),
  };
}

function reduceIndicator(indicator) {
  return {
    id: indicator.id,
    nome: indicator.nome,
    unidade: indicator.unidade,
    periodo: indicator.periodo,
    referencia: indicator.referencia,
    meninas: reduceCurve(indicator.curvas_z_meninas),
    meninos: reduceCurve(indicator.curvas_z_meninos),
    classificacao_z: indicator.classificacao_z,
    classificacao: indicator.classificacao,
  };
}

function reduceSection(section) {
  return Object.fromEntries(
    Object.entries(section).map(([key, value]) => [key, reduceIndicator(value)])
  );
}

const reduced = {
  metadados: raw.metadados,
  pediatrico_0_5_anos: reduceSection(raw.pediatrico_0_5_anos),
  pediatrico_5_19_anos: reduceSection(raw.pediatrico_5_19_anos),
  gestacional_iom_oms: raw.gestacional_iom_oms,
};

writeFileSync(outputPath, `${JSON.stringify(reduced)}\n`);

const sourceSize = statSync(sourcePath).size;
const outputSize = statSync(outputPath).size;
console.log(`WHO reference reduced: ${(sourceSize / 1024 / 1024).toFixed(1)}MB -> ${(outputSize / 1024 / 1024).toFixed(1)}MB`);
