// The IRS weights from project-conventions.md §Ranking. They sum to 1.0 and are
// the programme's, not a tuning knob — changing one changes every stored
// comparison between stores.
const IRS_WEIGHTS = {
  t1Total: 0.4,
  improvementDelta: 0.25,
  pitching: 0.2,
  mindset: 0.1,
  evidence: 0.05,
} as const;

export interface IncubationReadinessInput {
  /** T0's weighted total, or 0 when the store has no T0 — the delta then equals T1. */
  t0Total: number;
  t1Total: number;
  /** The PITCH_DECK judge average; null when no judge has submitted for this store. */
  pitchingAvgScore: number | null;
  /** Raw 0–4 scores of the mindset questions (Q47, Q48). */
  mindsetRawScores: number[];
  /** Raw 0–4 score of the evidence question (Q49). */
  evidenceRawScore: number;
  maxScorePerQuestion: number;
}

// A missing pitching average counts as 0 rather than voiding the score: a store
// nobody has judged yet is genuinely less ready than one that has been, and the
// caller has already decided the score is worth computing at all by having a
// submitted T1.
export function computeIncubationReadiness(input: IncubationReadinessInput): number {
  const mindsetScore = normalizeToPercent(
    input.mindsetRawScores.reduce((sum, score) => sum + score, 0),
    input.mindsetRawScores.length * input.maxScorePerQuestion,
  );
  const evidenceScore = normalizeToPercent(input.evidenceRawScore, input.maxScorePerQuestion);

  return round2(
    input.t1Total * IRS_WEIGHTS.t1Total +
      (input.t1Total - input.t0Total) * IRS_WEIGHTS.improvementDelta +
      (input.pitchingAvgScore ?? 0) * IRS_WEIGHTS.pitching +
      mindsetScore * IRS_WEIGHTS.mindset +
      evidenceScore * IRS_WEIGHTS.evidence,
  );
}

function normalizeToPercent(raw: number, max: number): number {
  return max === 0 ? 0 : (raw / max) * 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
