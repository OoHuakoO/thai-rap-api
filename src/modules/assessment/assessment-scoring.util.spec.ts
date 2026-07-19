import { RedFlagType, Severity } from '@prisma/client';
import {
  computeDimensionScores,
  computeTotalScore,
  detectRedFlags,
  getZone,
  type DimensionInfo,
  type ScoredQuestion,
} from './assessment-scoring.util';

function buildGoodScores(overrides: Record<number, number> = {}): ScoredQuestion[] {
  return Array.from({ length: 50 }, (_, i) => {
    const questionNo = i + 1;
    return { questionNo, dimensionId: 0, rawScore: overrides[questionNo] ?? 4 };
  });
}

describe('computeDimensionScores', () => {
  const dimensions: DimensionInfo[] = [
    { id: 1, weight: 40, questionCount: 2 },
    { id: 2, weight: 60, questionCount: 3 },
  ];

  it('should compute the percentage of max score per dimension', () => {
    const scores: ScoredQuestion[] = [
      { questionNo: 1, dimensionId: 1, rawScore: 3 },
      { questionNo: 2, dimensionId: 1, rawScore: 4 },
      { questionNo: 3, dimensionId: 2, rawScore: 2 },
      { questionNo: 4, dimensionId: 2, rawScore: 2 },
      { questionNo: 5, dimensionId: 2, rawScore: 2 },
    ];

    const result = computeDimensionScores(scores, dimensions);

    expect(result.get(1)).toBeCloseTo(87.5); // (3+4)/(2*4)*100
    expect(result.get(2)).toBeCloseTo(50); // (2+2+2)/(3*4)*100
  });

  it('should return 0 when a dimension has questionCount 0 (no division by zero)', () => {
    const result = computeDimensionScores([], [{ id: 9, weight: 0, questionCount: 0 }]);

    expect(result.get(9)).toBe(0);
  });

  it('should return 0 for a dimension with no matching scores', () => {
    const result = computeDimensionScores([{ dimensionId: 99, rawScore: 4 }], dimensions);

    expect(result.get(1)).toBe(0);
    expect(result.get(2)).toBe(0);
  });
});

describe('computeTotalScore', () => {
  const dimensions: DimensionInfo[] = [
    { id: 1, weight: 40, questionCount: 2 },
    { id: 2, weight: 60, questionCount: 3 },
  ];

  it('should sum each dimension pct weighted by the dimension weight', () => {
    const dimensionScores = new Map([
      [1, 80],
      [2, 50],
    ]);

    // 80*40/100 + 50*60/100 = 32 + 30 = 62
    expect(computeTotalScore(dimensionScores, dimensions)).toBeCloseTo(62);
  });

  it('should treat a dimension missing from the map as 0', () => {
    const dimensionScores = new Map([[1, 80]]); // dimension 2 absent

    expect(computeTotalScore(dimensionScores, dimensions)).toBeCloseTo(32); // 80*40/100 + 0
  });
});

describe('getZone', () => {
  it.each([
    [0, 'Red Zone'],
    [39.9, 'Red Zone'],
    [40, 'Survival Zone'],
    [59.9, 'Survival Zone'],
    [60, 'Improve Zone'],
    [74.9, 'Improve Zone'],
    [75, 'Growth Zone'],
    [84.9, 'Growth Zone'],
    [85, 'Model Zone'],
    [100, 'Model Zone'],
  ])('should classify %s as %s', (score, zone) => {
    expect(getZone(score)).toBe(zone);
  });
});

describe('detectRedFlags', () => {
  it('should raise no flags when every question scores well', () => {
    expect(detectRedFlags(buildGoodScores())).toEqual([]);
  });

  it('should raise FOOD_SAFETY (WARNING) when the Q8-14 average is below 2', () => {
    // Q13 stays at 4 so this case doesn't also trip LEGAL.
    const scores = buildGoodScores({ 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 4, 14: 1 });

    expect(detectRedFlags(scores)).toContainEqual({
      type: RedFlagType.FOOD_SAFETY,
      severity: Severity.WARNING,
      triggerQuestions: [8, 9, 10, 11, 12, 13, 14],
    });
  });

  it('should not raise FOOD_SAFETY when the Q8-14 average is at least 2', () => {
    const scores = buildGoodScores({ 8: 2, 9: 2, 10: 2, 11: 2, 12: 2, 13: 4, 14: 2 });

    expect(detectRedFlags(scores)).not.toContainEqual(
      expect.objectContaining({ type: RedFlagType.FOOD_SAFETY }),
    );
  });

  it('should raise FINANCIAL (CRITICAL) only for the Q28-31 questions scoring <= 1', () => {
    const scores = buildGoodScores({ 28: 1, 29: 4, 30: 0, 31: 4 });

    expect(detectRedFlags(scores)).toContainEqual({
      type: RedFlagType.FINANCIAL,
      severity: Severity.CRITICAL,
      triggerQuestions: [28, 30],
    });
  });

  it('should raise OPERATION (WARNING) only for the Q35/36/39/41 questions scoring <= 1', () => {
    const scores = buildGoodScores({ 35: 1, 41: 0 });

    expect(detectRedFlags(scores)).toContainEqual({
      type: RedFlagType.OPERATION,
      severity: Severity.WARNING,
      triggerQuestions: [35, 41],
    });
  });

  it('should raise MARKET (WARNING) only for the Q21/22 questions scoring <= 1', () => {
    const scores = buildGoodScores({ 21: 1 });

    expect(detectRedFlags(scores)).toContainEqual({
      type: RedFlagType.MARKET,
      severity: Severity.WARNING,
      triggerQuestions: [21],
    });
  });

  it('should raise LEGAL (CRITICAL) only when Q13 is exactly 0', () => {
    expect(detectRedFlags(buildGoodScores({ 13: 1 }))).not.toContainEqual(
      expect.objectContaining({ type: RedFlagType.LEGAL }),
    );

    expect(detectRedFlags(buildGoodScores({ 13: 0 }))).toContainEqual({
      type: RedFlagType.LEGAL,
      severity: Severity.CRITICAL,
      triggerQuestions: [13],
    });
  });

  it('should raise OWNER_READINESS (WARNING) for Q47/48 questions scoring below 2', () => {
    const scores = buildGoodScores({ 47: 1, 48: 4 });

    expect(detectRedFlags(scores)).toContainEqual({
      type: RedFlagType.OWNER_READINESS,
      severity: Severity.WARNING,
      triggerQuestions: [47],
    });
  });

  it('should raise EVIDENCE (WARNING) when Q49 is below 2', () => {
    expect(detectRedFlags(buildGoodScores({ 49: 1 }))).toContainEqual({
      type: RedFlagType.EVIDENCE,
      severity: Severity.WARNING,
      triggerQuestions: [49],
    });
  });

  it('should raise GROWTH (WARNING) when Q50 is below 2', () => {
    expect(detectRedFlags(buildGoodScores({ 50: 1 }))).toContainEqual({
      type: RedFlagType.GROWTH,
      severity: Severity.WARNING,
      triggerQuestions: [50],
    });
  });

  it('should raise every applicable flag together when multiple thresholds are crossed', () => {
    const scores = buildGoodScores({ 13: 0, 28: 1, 50: 1 });

    const flags = detectRedFlags(scores);

    expect(flags.map((f) => f.type)).toEqual(
      expect.arrayContaining([RedFlagType.FINANCIAL, RedFlagType.LEGAL, RedFlagType.GROWTH]),
    );
  });
});
