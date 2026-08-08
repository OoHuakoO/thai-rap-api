import { computeIncubationReadiness } from './analytics-scoring.util';

const base = {
  t0Total: 50,
  t1Total: 70,
  pitchingAvgScore: 80,
  mindsetRawScores: [4, 4],
  evidenceRawScore: 4,
  maxScorePerQuestion: 4,
};

describe('computeIncubationReadiness', () => {
  it('applies the five weighted terms of the IRS formula', () => {
    // 70×0.40 + (70−50)×0.25 + 80×0.20 + 100×0.10 + 100×0.05 = 28 + 5 + 16 + 10 + 5
    expect(computeIncubationReadiness(base)).toBe(64);
  });

  it('normalizes the two mindset questions to a percentage before weighting', () => {
    // (2+2)/8 → 50, so the mindset term drops from 10 to 5.
    expect(computeIncubationReadiness({ ...base, mindsetRawScores: [2, 2] })).toBe(59);
  });

  it('normalizes the evidence question the same way', () => {
    // 2/4 → 50, so the evidence term drops from 5 to 2.5.
    expect(computeIncubationReadiness({ ...base, evidenceRawScore: 2 })).toBe(61.5);
  });

  // A store nobody has judged is genuinely less ready than one that has been —
  // the term is zero, not a reason to withhold the whole score.
  it('counts a missing pitching average as zero rather than voiding the score', () => {
    expect(computeIncubationReadiness({ ...base, pitchingAvgScore: null })).toBe(48);
  });

  it('treats a missing T0 as zero, so the delta is the whole of T1', () => {
    // 70×0.40 + 70×0.25 + 80×0.20 + 10 + 5 = 28 + 17.5 + 16 + 15
    expect(computeIncubationReadiness({ ...base, t0Total: 0 })).toBe(76.5);
  });

  it('can go negative when a store regressed hard between rounds', () => {
    const result = computeIncubationReadiness({
      ...base,
      t0Total: 90,
      t1Total: 10,
      pitchingAvgScore: 0,
      mindsetRawScores: [0, 0],
      evidenceRawScore: 0,
    });
    // 10×0.40 + (10−90)×0.25 = 4 − 20
    expect(result).toBe(-16);
  });

  it('rounds to two decimals', () => {
    expect(computeIncubationReadiness({ ...base, t1Total: 70.333 })).toBe(64.22);
  });
});
