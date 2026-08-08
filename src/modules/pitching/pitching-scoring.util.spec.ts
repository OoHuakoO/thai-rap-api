import {
  averageScore,
  computeTotalScore,
  evaluateMinimumConditions,
  getPitchingLevel,
} from './pitching-scoring.util';

describe('computeTotalScore', () => {
  it('sums the criterion scores without weighting them', () => {
    expect(
      computeTotalScore([
        { criterionId: 101, score: 5 },
        { criterionId: 102, score: 12 },
        { criterionId: 103, score: 15 },
      ]),
    ).toBe(32);
  });

  it('treats an unscored criterion as zero so a draft still has a live total', () => {
    expect(
      computeTotalScore([
        { criterionId: 101, score: 5 },
        { criterionId: 102, score: null },
      ]),
    ).toBe(5);
  });

  it('returns zero for an empty form', () => {
    expect(computeTotalScore([])).toBe(0);
  });
});

describe('getPitchingLevel', () => {
  it.each([
    [100, 'HIGHLY_SUITABLE'],
    [80, 'HIGHLY_SUITABLE'],
    [79.99, 'SUITABLE'],
    [70, 'SUITABLE'],
    [69, 'FAIR'],
    [60, 'FAIR'],
    [59.99, 'NOT_READY'],
    [0, 'NOT_READY'],
  ])('maps %s to %s', (score, expected) => {
    expect(getPitchingLevel(score)).toBe(expected);
  });
});

describe('evaluateMinimumConditions', () => {
  it('passes when both readings clear their thresholds', () => {
    expect(evaluateMinimumConditions({ scoreCardTotal: 30, participationPct: 90 })).toMatchObject({
      scoreCardPassed: true,
      participationPassed: true,
      passed: true,
    });
  });

  it('fails when the score card is below 30', () => {
    expect(evaluateMinimumConditions({ scoreCardTotal: 29, participationPct: 100 })).toMatchObject({
      scoreCardPassed: false,
      passed: false,
    });
  });

  it('fails when participation is below 90%', () => {
    expect(evaluateMinimumConditions({ scoreCardTotal: 40, participationPct: 89.9 })).toMatchObject(
      {
        participationPassed: false,
        passed: false,
      },
    );
  });

  it('treats an unrecorded reading as failed, never as met', () => {
    expect(
      evaluateMinimumConditions({ scoreCardTotal: null, participationPct: null }),
    ).toMatchObject({ scoreCardPassed: false, participationPassed: false, passed: false });
  });
});

describe('averageScore', () => {
  it('averages the judges and rounds to two decimals', () => {
    expect(averageScore([83, 80, 78])).toBe(80.33);
  });

  it('returns null when no judge has submitted', () => {
    expect(averageScore([])).toBeNull();
  });
});
