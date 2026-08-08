import type { RedFlagType, Round, Severity } from '@prisma/client';

export interface AnalyticsKpis {
  t0Score: number | null;
  t1Score: number | null;
  improvementRate: number | null;
  rankInProject: number | null;
  totalStores: number;
  zone: string | null;
  /**
   * Incubation Readiness Score — project-conventions.md's Ranking formula, run
   * on T0/T1 plus the store's PITCH_DECK judge average. Null until T1 is
   * submitted, because every term but the pitching one comes off that round.
   */
  incubationReadiness: number | null;
}

export interface AnalyticsRadarSeries {
  name: string;
  data: (number | null)[];
}

export interface AnalyticsRadarChart {
  axes: string[];
  series: AnalyticsRadarSeries[];
}

export interface AnalyticsTrendSeries {
  name: string;
  data: (number | null)[];
}

export interface AnalyticsTrend {
  xAxis: Round[];
  series: AnalyticsTrendSeries[];
}

export interface AnalyticsDimensionHighlight {
  dimensionId: number;
  name: string;
  score: number;
}

export interface AnalyticsRedFlag {
  id: string;
  assessmentId: string;
  type: RedFlagType;
  severity: Severity;
  triggerQuestions: number[];
  recommendation: string | null;
  resolved: boolean;
}

export interface StoreAnalyticsResult {
  storeId: string;
  kpis: AnalyticsKpis;
  radar: AnalyticsRadarChart;
  trend: AnalyticsTrend;
  strengths: AnalyticsDimensionHighlight[];
  weaknesses: AnalyticsDimensionHighlight[];
  redFlags: AnalyticsRedFlag[];
}
