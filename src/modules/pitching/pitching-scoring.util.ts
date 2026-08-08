import {
  PITCHING_LEVEL_THRESHOLDS,
  PITCHING_PARTICIPATION_MIN_PASS,
  PITCHING_SCORE_CARD_MIN_PASS,
  type PitchingLevel,
} from './pitching.const';

export interface CriterionScore {
  criterionId: number;
  score: number | null;
}

export interface MinimumConditions {
  scoreCardTotal: number | null;
  participationPct: number | null;
  scoreCardPassed: boolean;
  participationPassed: boolean;
  passed: boolean;
}

// Every criterion is worth its own maxScore and Σ maxScore per round is 100, so
// the total is a plain sum — there is no weighting step here, unlike the
// 50-question assessment.
export function computeTotalScore(scores: CriterionScore[]): number {
  return scores.reduce((sum, s) => sum + (s.score ?? 0), 0);
}

export function getPitchingLevel(score: number): PitchingLevel {
  if (score >= PITCHING_LEVEL_THRESHOLDS.HIGHLY_SUITABLE) return 'HIGHLY_SUITABLE';
  if (score >= PITCHING_LEVEL_THRESHOLDS.SUITABLE) return 'SUITABLE';
  if (score >= PITCHING_LEVEL_THRESHOLDS.FAIR) return 'FAIR';
  return 'NOT_READY';
}

// An unfilled condition is a failed one: the form is a gate, so "not recorded"
// must never read as "met". The caller decides what to do with `passed` — the
// acceleration form lets a committee select anyway and write down why.
export function evaluateMinimumConditions(input: {
  scoreCardTotal: number | null;
  participationPct: number | null;
}): MinimumConditions {
  const scoreCardPassed =
    input.scoreCardTotal !== null && input.scoreCardTotal >= PITCHING_SCORE_CARD_MIN_PASS;
  const participationPassed =
    input.participationPct !== null && input.participationPct >= PITCHING_PARTICIPATION_MIN_PASS;
  return {
    scoreCardTotal: input.scoreCardTotal,
    participationPct: input.participationPct,
    scoreCardPassed,
    participationPassed,
    passed: scoreCardPassed && participationPassed,
  };
}

// Averaging the judges is what decides an outcome — คะแนนเฉลี่ยกรรมการ on both
// forms. Rounded to two decimals so the same number reaches the ranking, the
// report and the export without each rounding it its own way.
export function averageScore(totals: number[]): number | null {
  if (totals.length === 0) return null;
  return roundTo2(totals.reduce((sum, total) => sum + total, 0) / totals.length);
}

export function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}
