import { RedFlagType, Severity } from '@prisma/client';

export interface DimensionInfo {
  id: number;
  weight: number;
  questionCount: number;
}

export interface ScoredQuestion {
  questionNo: number;
  dimensionId: number;
  rawScore: number;
}

export interface RedFlagCandidate {
  type: RedFlagType;
  severity: Severity;
  triggerQuestions: number[];
}

export const MAX_SCORE_PER_QUESTION = 4;

export function computeDimensionScores(
  scores: ScoredQuestion[],
  dimensions: DimensionInfo[],
): Map<number, number> {
  const result = new Map<number, number>();
  for (const dimension of dimensions) {
    const dimensionScores = scores.filter((s) => s.dimensionId === dimension.id);
    const total = dimensionScores.reduce((sum, s) => sum + s.rawScore, 0);
    const max = dimension.questionCount * MAX_SCORE_PER_QUESTION;
    const pct = max === 0 ? 0 : (total / max) * 100;
    result.set(dimension.id, pct);
  }
  return result;
}

export function computeTotalScore(
  dimensionScores: Map<number, number>,
  dimensions: DimensionInfo[],
): number {
  return dimensions.reduce((sum, dimension) => {
    const score = dimensionScores.get(dimension.id) ?? 0;
    return sum + (score * dimension.weight) / 100;
  }, 0);
}

export function getZone(totalScore: number): string {
  if (totalScore < 40) return 'Red Zone';
  if (totalScore < 60) return 'Survival Zone';
  if (totalScore < 75) return 'Improve Zone';
  if (totalScore < 85) return 'Growth Zone';
  return 'Model Zone';
}

export function detectRedFlags(scores: ScoredQuestion[]): RedFlagCandidate[] {
  const flags: RedFlagCandidate[] = [];
  const byQ = (questionNo: number): number =>
    scores.find((s) => s.questionNo === questionNo)?.rawScore ?? 0;

  const foodSafetyScores = scores.filter((s) => s.questionNo >= 8 && s.questionNo <= 14);
  const foodSafetyAvg =
    foodSafetyScores.length === 0
      ? 0
      : foodSafetyScores.reduce((sum, s) => sum + s.rawScore, 0) / foodSafetyScores.length;
  if (foodSafetyAvg < 2) {
    flags.push({
      type: RedFlagType.FOOD_SAFETY,
      severity: Severity.WARNING,
      triggerQuestions: [8, 9, 10, 11, 12, 13, 14],
    });
  }

  const financialTriggers = [28, 29, 30, 31].filter((q) => byQ(q) <= 1);
  if (financialTriggers.length > 0) {
    flags.push({
      type: RedFlagType.FINANCIAL,
      severity: Severity.CRITICAL,
      triggerQuestions: financialTriggers,
    });
  }

  const operationTriggers = [35, 36, 39, 41].filter((q) => byQ(q) <= 1);
  if (operationTriggers.length > 0) {
    flags.push({
      type: RedFlagType.OPERATION,
      severity: Severity.WARNING,
      triggerQuestions: operationTriggers,
    });
  }

  const marketTriggers = [21, 22].filter((q) => byQ(q) <= 1);
  if (marketTriggers.length > 0) {
    flags.push({
      type: RedFlagType.MARKET,
      severity: Severity.WARNING,
      triggerQuestions: marketTriggers,
    });
  }

  if (byQ(13) === 0) {
    flags.push({ type: RedFlagType.LEGAL, severity: Severity.CRITICAL, triggerQuestions: [13] });
  }

  const ownerReadinessTriggers = [47, 48].filter((q) => byQ(q) < 2);
  if (ownerReadinessTriggers.length > 0) {
    flags.push({
      type: RedFlagType.OWNER_READINESS,
      severity: Severity.WARNING,
      triggerQuestions: ownerReadinessTriggers,
    });
  }

  if (byQ(49) < 2) {
    flags.push({ type: RedFlagType.EVIDENCE, severity: Severity.WARNING, triggerQuestions: [49] });
  }

  if (byQ(50) < 2) {
    flags.push({ type: RedFlagType.GROWTH, severity: Severity.WARNING, triggerQuestions: [50] });
  }

  return flags;
}
