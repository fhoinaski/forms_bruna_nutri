import type { PortionWeightSource } from "@/lib/nutrition-import/types";

/**
 * FASE 6 — extracao heuristica de peso a partir do TEXTO do rotulo da
 * medida caseira (ex.: "Pedaço/Unidade/Fatia (M) (370 g)" -> 370), SEMPRE
 * mantida separada do valor estruturado measure.quantity/unit que a propria
 * fonte fornece. As duas nunca sao fundidas na mesma coluna — ver
 * canonical_food_portions.parsed_label_grams vs. source_measure_quantity no
 * schema.
 */
const LABEL_GRAM_PATTERN = /\(\s*(\d+(?:[.,]\d+)?)\s*g\s*\)/i;
const LABEL_ML_PATTERN = /\(\s*(\d+(?:[.,]\d+)?)\s*m\s*l\s*\)/i;

function parseNumber(raw: string): number | null {
  const normalized = raw.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Extrai gramas mencionadas no rotulo (heuristica, nunca autoritativa). */
export function parseLabelGrams(label: string): number | null {
  const match = LABEL_GRAM_PATTERN.exec(label);
  if (!match) return null;
  return parseNumber(match[1]);
}

/** Extrai mL mencionados no rotulo (heuristica, nunca autoritativa). */
export function parseLabelMilliliters(label: string): number | null {
  const match = LABEL_ML_PATTERN.exec(label);
  if (!match) return null;
  return parseNumber(match[1]);
}

export interface StructuredMeasure {
  quantity: number | null;
  unit: string | null;
  raw: string | null;
}

export interface ResolvedPortionWeight {
  gramWeight: number | null;
  mlWeight: number | null;
  parsedLabelGrams: number | null;
  weightSource: PortionWeightSource;
  confidence: "high" | "medium" | "low";
}

/**
 * Decide gram_weight/ml_weight autoritativos SOMENTE a partir do campo
 * estruturado measure.quantity/unit da propria fonte — nunca do texto do
 * rotulo. Quando so ha o rotulo (ou o measure estruturado nao bate com uma
 * unidade de peso conhecida), gramWeight/mlWeight ficam null e
 * weightSource vira 'parsed_from_label' ou 'unknown'; parsedLabelGrams e
 * sempre calculado e exposto a parte, nunca promovido a gramWeight
 * automaticamente (regra: "nao assumir mL = g", "nao inventar
 * informacao de fonte").
 */
export function resolvePortionWeight(label: string, measure: StructuredMeasure | null): ResolvedPortionWeight {
  const parsedLabelGrams = parseLabelGrams(label);

  if (measure && measure.quantity !== null && measure.unit) {
    const unit = measure.unit.trim().toLowerCase();
    if (unit === "g" || unit === "grama" || unit === "gramas") {
      return {
        gramWeight: measure.quantity,
        mlWeight: null,
        parsedLabelGrams,
        weightSource: "structured_quantity",
        confidence: "high",
      };
    }
    if (unit === "ml" || unit === "mililitro" || unit === "mililitros") {
      // Peso em mL NUNCA vira gramWeight aqui — "nao assumir mL = g" (Fase 18
      // do modelo canonico). mlWeight fica registrado; gramWeight so seria
      // preenchido por uma tabela de densidade explicita, fora de escopo
      // desta fase.
      return {
        gramWeight: null,
        mlWeight: measure.quantity,
        parsedLabelGrams,
        weightSource: "structured_quantity",
        confidence: "medium",
      };
    }
  }

  if (parsedLabelGrams !== null) {
    return {
      gramWeight: null, // heuristica de rotulo nunca vira peso autoritativo automaticamente
      mlWeight: null,
      parsedLabelGrams,
      weightSource: "parsed_from_label",
      confidence: "low",
    };
  }

  return {
    gramWeight: null,
    mlWeight: null,
    parsedLabelGrams: null,
    weightSource: "unknown",
    confidence: "low",
  };
}
