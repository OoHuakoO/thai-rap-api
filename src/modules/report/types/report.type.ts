import type { RedFlagType, Round, Severity } from '@prisma/client';

export interface ReportStore {
  id: string;
  name: string;
  province: string;
  storeType: string;
  ownerName: string;
}

export interface ReportDimensionScore {
  dimensionId: number;
  dimensionName: string;
  weight: number;
  scorePct: number;
}

export interface ReportRedFlag {
  type: RedFlagType;
  severity: Severity;
  triggerQuestions: number[];
  resolved: boolean;
}

/** One assessed round: what "รายงานผลการประเมินแต่ละ T" shows. */
export interface RoundReport {
  store: ReportStore;
  round: Round;
  totalScore: number | null;
  zone: string | null;
  assessorName: string;
  submittedAt: Date | null;
  notes: string | null;
  dimensions: ReportDimensionScore[];
  redFlags: ReportRedFlag[];
}

export interface OverviewRoundSummary {
  round: Round;
  totalScore: number | null;
  zone: string | null;
  /** Change against the previously assessed round; null for the first one. */
  delta: number | null;
  submittedAt: Date | null;
}

/** Every round side by side: "รายงานผลการประเมินภาพรวมทุก T". */
export interface OverviewReport {
  store: ReportStore;
  rounds: OverviewRoundSummary[];
  /** Per dimension, the score in each assessed round, keyed by round. */
  dimensionTrends: {
    dimensionId: number;
    dimensionName: string;
    weight: number;
    scoresByRound: Partial<Record<Round, number>>;
  }[];
  unresolvedRedFlagCount: number;
}
