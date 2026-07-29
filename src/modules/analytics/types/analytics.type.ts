import type { RedFlagType, Round, Severity } from '@prisma/client';

export interface AnalyticsKpis {
  t0Score: number | null;
  t1Score: number | null;
  improvementRate: number | null;
  rankInProject: number | null;
  totalStores: number;
  zone: string | null;
  /**
   * Full IRS needs a pitching score, which has no data model yet
   * (project-conventions.md's Ranking formula requires PitchingScore) —
   * always null until that module exists.
   */
  incubationReadiness: null;
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
  actualCount: number;
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
  // No LLM-narrative, mentor-note, or incubation-status data model exists yet
  // — these three stay fixed at their "nothing to show" value on purpose,
  // matching the frontend's null/empty handling, not a TODO left half-done.
  aiAnalysis: null;
  mentorRecommendations: [];
  incubationStatus: null;
}
