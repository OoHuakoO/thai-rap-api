import type { PitchingRecommendation, PitchingRound, PitchingStatus } from '@prisma/client';
import type { PitchingLevel } from '../pitching.const';
import type { MinimumConditions } from '../pitching-scoring.util';

export interface PitchingCriterionItem {
  id: number;
  round: PitchingRound;
  code: string;
  section: string | null;
  title: string;
  guideline: string;
  maxScore: number;
  sortOrder: number;
}

export interface PitchingCriterionScore extends PitchingCriterionItem {
  score: number | null;
  note: string | null;
}

export interface PitchingStoreRef {
  storeId: string;
  storeCode: string;
  storeName: string;
  province: string | null;
}

export interface PitchingListItem extends PitchingStoreRef {
  id: string;
  round: PitchingRound;
  judgeId: string;
  judgeName: string;
  status: PitchingStatus;
  /** Frozen at submit; null while the form is still a draft. */
  totalScore: number | null;
  /** Σ of whatever is scored right now; equals totalScore once submitted. */
  currentScore: number;
  /** Derived from totalScore, so null until the form is submitted. */
  level: PitchingLevel | null;
  recommendation: PitchingRecommendation | null;
  evaluatedAt: Date | null;
  updatedAt: Date;
  submittedAt: Date | null;
}

export interface PitchingResult extends PitchingListItem {
  prototypeProduct: string | null;
  /** ACCELERATION only — the PITCH_DECK form has no minimum conditions. */
  minimumConditions: MinimumConditions | null;
  evidenceChecked: string[];
  comments: Record<string, string>;
  recommendationReason: string | null;
  noConflictOfInterest: boolean;
  createdAt: Date;
  criteria: PitchingCriterionScore[];
}

export interface PitchingRecommendationCounts {
  SELECTED: number;
  WAITING_LIST: number;
  MINIMUM_NOT_MET: number;
  NOT_SELECTED: number;
}

export interface PitchingSummaryItem extends PitchingStoreRef {
  rank: number;
  judgeCount: number;
  avgScore: number;
  level: PitchingLevel;
  recommendationCounts: PitchingRecommendationCounts;
  /** How many judges recorded both minimum conditions as met (ACCELERATION). */
  minimumPassedCount: number;
}

export interface PitchingCriterionAverage extends PitchingCriterionItem {
  avgScore: number;
  /** avgScore as a percentage of maxScore, for the per-criterion bar chart. */
  avgPct: number;
}

export interface PitchingStoreReport extends PitchingStoreRef {
  round: PitchingRound;
  avgScore: number | null;
  level: PitchingLevel | null;
  rank: number | null;
  /** Stores in this round with at least one submitted form — the rank's denominator. */
  rankedStoreCount: number;
  judgeCount: number;
  recommendationCounts: PitchingRecommendationCounts;
  criteria: PitchingCriterionAverage[];
  judges: PitchingResult[];
}
