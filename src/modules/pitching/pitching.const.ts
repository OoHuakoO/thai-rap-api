import { PitchingRecommendation, PitchingRound } from '@prisma/client';

// Both paper forms are marked out of 100.
export const PITCHING_TOTAL_MAX = 100;

// เกณฑ์พิจารณาผลการคัดเลือก — identical cut points on both forms (ส่วนที่ 2 of the
// pitch deck form, the table on page 4 of the acceleration one).
export const PITCHING_LEVEL_THRESHOLDS = {
  HIGHLY_SUITABLE: 80,
  SUITABLE: 70,
  FAIR: 60,
} as const;

export type PitchingLevel = 'HIGHLY_SUITABLE' | 'SUITABLE' | 'FAIR' | 'NOT_READY';

// เงื่อนไขขั้นต่ำ on the acceleration form (ส่วนที่ 1). Failing either one is not
// a hard block on submitting — the form says a committee may still record a
// special-case decision — so these drive a computed flag, never a rejection.
export const PITCHING_SCORE_CARD_MAX = 40;
export const PITCHING_SCORE_CARD_MIN_PASS = 30;
export const PITCHING_PARTICIPATION_MIN_PASS = 90;

// ความเห็นของคณะกรรมการ — the free-text prompts, in the order they are printed.
// The two rounds ask different questions, which is why Pitching.comments is a
// keyed map rather than a column per prompt.
export const PITCHING_COMMENT_KEYS: Record<PitchingRound, readonly string[]> = {
  [PitchingRound.PITCH_DECK]: [
    'strengths',
    'urgentImprovements',
    'salesCostFeasibility',
    'productMarketPotential',
    'suggestions',
  ],
  [PitchingRound.ACCELERATION]: ['strengths', 'risks', 'conditions', 'fundingSuggestions'],
} as const;

// หลักฐานที่ตรวจสอบ — the nine checkboxes on the acceleration form. The pitch
// deck form has no checklist, so an entry sent with that round is rejected.
export const PITCHING_EVIDENCE_KEYS: Record<PitchingRound, readonly string[]> = {
  [PitchingRound.PITCH_DECK]: [],
  [PitchingRound.ACCELERATION]: [
    'SCORE_CARD',
    'SOP',
    'COSTING',
    'ACCOUNTING',
    'PARTICIPATION_REPORT',
    'MARKET_VALIDATION',
    'PRODUCTION_CAPACITY',
    'STANDARDS',
    'FINANCIAL_PLAN',
  ],
} as const;

// ความเห็นสรุปของกรรมการ. MINIMUM_NOT_MET is an acceleration-only verdict —
// the pitch deck form has no minimum condition to fail.
export const PITCHING_ALLOWED_RECOMMENDATIONS: Record<
  PitchingRound,
  readonly PitchingRecommendation[]
> = {
  [PitchingRound.PITCH_DECK]: [
    PitchingRecommendation.SELECTED,
    PitchingRecommendation.WAITING_LIST,
    PitchingRecommendation.NOT_SELECTED,
  ],
  [PitchingRound.ACCELERATION]: [
    PitchingRecommendation.SELECTED,
    PitchingRecommendation.WAITING_LIST,
    PitchingRecommendation.MINIMUM_NOT_MET,
    PitchingRecommendation.NOT_SELECTED,
  ],
} as const;
