import { classifyQueryRisk, type ConfidenceFeatures, type QueryRisk, type MatchClass } from "@/lib/nutrition/canonical-confidence-features";

/**
 * FASE 5.5 (item 9) — canAutoResolveCanonicalV2(). NAO substitui
 * lib/nutrition/canonical-food-shadow.ts#canUseCanonical (V1) — as duas
 * rodam LADO A LADO (ver scripts/canonical-nutrition-import/
 * fase55-calibration-dataset.ts). prefer_canonical continua desligado;
 * nenhuma das duas decide o valor entregue ao usuario nesta fase.
 *
 * Diferente da V1 (1 regra: score>=90 + gap>=8 + sem conflito de preparo
 * pra QUALQUER tipo de match), a V2 usa uma policy DIFERENTE por
 * MatchClass (item 3), nunca aceita quando ha risco alto (item 4), nunca
 * aceita GENERIC_SHORT_QUERY (item 6), nunca aceita quando VARIETY_REQUIRED
 * (item 7), e nunca trata TEXT_INFERRED como STRUCTURED_EXACT (item 5).
 */

export interface ConfidenceV2Verdict {
  autoAccept: boolean;
  matchClass: MatchClass;
  queryRisk: QueryRisk;
  reason: string;
}

const THRESHOLDS: Record<MatchClass, { minScore: number; minGap: number } | null> = {
  // EXACT_ALIAS: curado a mao (food_aliases), pode exigir MENOS score —
  // a confianca ja vem de um humano ter cadastrado o alias, nao do ranking.
  EXACT_ALIAS: { minScore: 80, minGap: 0 },
  // Nome exato + preparo confirmado (estruturado OU texto exato) e o sinal
  // mais forte possivel do proprio ranking — mas o GAP minimo nunca fica
  // abaixo do mesmo piso de "decisivo" usado em todo o resto do sistema
  // (resolveCanonicalFood/V1: gap>=8) — achado real nesta fase (calibracao
  // com ground truth real): um gap de so 5-7 pontos ainda pode ser um
  // quase-empate genuino (ver reports/canonical-confidence-errors.md,
  // caso "Semente, papoula, crua"), preparo confirmado nao compensa isso.
  EXACT_NAME_AND_PREPARATION: { minScore: 95, minGap: 8 },
  EXACT_NAME: { minScore: 95, minGap: 8 },
  STRONG_TOKEN_MATCH: { minScore: 100, minGap: 15 },
  // FTS/PARTIAL (CONTAINS/FTS) precisa de MUITO mais evidencia (item 3) —
  // score alto sozinho nunca basta; so aceita em LOW_RISK com folga grande.
  FTS_PARTIAL: { minScore: 115, minGap: 25 },
  // GENERIC_SHORT_QUERY nunca auto-resolve, independente de score (item 6) — sem threshold nenhum.
  GENERIC_SHORT_QUERY: null,
};

export function canAutoResolveCanonicalV2(features: ConfidenceFeatures): ConfidenceV2Verdict {
  const queryRisk = classifyQueryRisk(features);
  const matchClass = features.matchClass;

  if (matchClass === "GENERIC_SHORT_QUERY") {
    return { autoAccept: false, matchClass, queryRisk, reason: "query generica de 1 token — nunca auto-resolvida, mesmo com score alto (item 6)." };
  }
  if (features.varietyRequired) {
    return { autoAccept: false, matchClass, queryRisk, reason: "multiplas variedades/cultivares plausiveis pro mesmo alimento base — exige escolha explicita (item 7)." };
  }
  if (features.simpleVsCompositeConflict) {
    return { autoAccept: false, matchClass, queryRisk, reason: "query simples casaria com um alimento simples, mas o topo e um prato/preparo composto — bloqueado (item 6)." };
  }
  if (features.preparationConflict) {
    return { autoAccept: false, matchClass, queryRisk, reason: "evidencia de preparo diferente do pedido (CONFLICT)." };
  }
  // item 5: preparo pedido mas so com evidencia fraca (TEXT_INFERRED) —
  // nunca tratado como confirmacao, mesmo que o resto da policy aceitaria.
  if (features.presenceOfPreparationSignal && features.preparationEvidence === "TEXT_INFERRED") {
    return { autoAccept: false, matchClass, queryRisk, reason: "preparo pedido sem evidencia exata (nem estruturada nem texto exato) — TEXT_INFERRED nunca conta como confirmacao." };
  }
  if (queryRisk === "HIGH_RISK") {
    return { autoAccept: false, matchClass, queryRisk, reason: "query classificada como alto risco." };
  }

  const threshold = THRESHOLDS[matchClass];
  if (!threshold) {
    return { autoAccept: false, matchClass, queryRisk, reason: "classe de match sem policy de auto-aceitacao definida." };
  }
  if (features.totalScore < threshold.minScore) {
    return { autoAccept: false, matchClass, queryRisk, reason: `score ${features.totalScore.toFixed(1)} abaixo do minimo ${threshold.minScore} pra classe ${matchClass}.` };
  }
  const gap = features.gapToSecond ?? Infinity;
  if (gap < threshold.minGap) {
    return { autoAccept: false, matchClass, queryRisk, reason: `gap ${gap === Infinity ? "N/A" : gap.toFixed(1)} abaixo do minimo ${threshold.minGap} pra classe ${matchClass}.` };
  }
  // FTS_PARTIAL so aceita em LOW_RISK mesmo satisfazendo score/gap — "exigir muito mais evidencia" (item 3).
  if (matchClass === "FTS_PARTIAL" && queryRisk !== "LOW_RISK") {
    return { autoAccept: false, matchClass, queryRisk, reason: "FTS/PARTIAL exige LOW_RISK, nunca MEDIUM/HIGH, mesmo com score/gap suficientes." };
  }

  return { autoAccept: true, matchClass, queryRisk, reason: "score/gap suficientes pra classe de match, sem sinais de risco/conflito." };
}
