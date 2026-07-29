import type { RedFlagType, Round, Severity } from '@prisma/client';
import type { PaginationMeta } from '@common/types/api-response.type';

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

/** One of the 50 questions as it appears on the per-question report. */
export interface ReportQuestionScore {
  questionNo: number;
  questionText: string;
  /** null when the assessor left the question unanswered. */
  rawScore: number | null;
  maxScore: number;
}

/**
 * A dimension with the arithmetic behind its percentage spelled out, so the
 * report can show how the weighted total was reached rather than only the
 * result: rawScore / maxScore → scorePct, then scorePct × weight / 100.
 */
export interface ReportDimensionDetail extends ReportDimensionScore {
  rawScore: number;
  maxScore: number;
  weightedScore: number;
  questions: ReportQuestionScore[];
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
  /** The weighted total — คะแนนถ่วงน้ำหนัก on the Excel template. */
  totalScore: number | null;
  zone: string | null;
  assessorName: string;
  submittedAt: Date | null;
  notes: string | null;
  /** Σ raw score across every answered question — คะแนนดิบ. */
  rawScore: number;
  /** Σ Question.maxScore across all 50 questions. */
  maxScore: number;
  /** rawScore / maxScore — คะแนนรวม %, unweighted. */
  rawScorePct: number;
  /** Answered questions / total questions — ความครบถ้วน. */
  completionPct: number;
  dimensions: ReportDimensionDetail[];
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

export interface RoundMatrixDimension {
  dimensionId: number;
  dimensionName: string;
  weight: number;
}

/** One store's row on the cross-store matrix — a row of 03_สรุปคะแนน. */
export interface RoundMatrixRow {
  storeId: string;
  storeCode: string;
  storeName: string;
  province: string;
  completionPct: number;
  rawScore: number;
  rawScorePct: number;
  weightedScore: number | null;
  /** ระดับรวม — the Thai label over the weighted total, not the Zone scale. */
  overallLevel: string;
  redFlagCount: number;
  unresolvedRedFlagCount: number;
  /** The lowest-scoring dimension — มิติเร่งแก้ไข; null when nothing is scored. */
  criticalDimensionId: number | null;
  criticalDimensionName: string | null;
  /** Percentage per dimension, keyed by dimension id. */
  scoresByDimension: Record<number, number>;
}

/**
 * Every store's dimension scores for one round side by side:
 * "ผลค่าคะแนนแต่ละมิติของทุกร้าน ของแต่ละ T". Stores the caller may not read are
 * absent, so an ENTREPRENEUR sees a one-row matrix rather than a 403.
 */
export interface RoundMatrixReport {
  round: Round;
  dimensions: RoundMatrixDimension[];
  /** One page of stores — `meta.total` is how many the round has in all. */
  rows: RoundMatrixRow[];
  /**
   * Cohort means over every store in the round, never only the page — a mean
   * that moved as the reader paged would not be the cohort's.
   */
  averageByDimension: Record<number, number>;
  averageWeightedScore: number | null;
  meta: PaginationMeta;
}

/**
 * The same matrix as a download: every store in the round, handed to the writer
 * one row at a time so the file can be produced without the cohort ever being
 * one array in memory. `rows` is read once — it is a stream, not a collection.
 */
export interface RoundMatrixExportSource {
  round: Round;
  dimensions: RoundMatrixDimension[];
  storeCount: number;
  averageByDimension: Record<number, number>;
  averageWeightedScore: number | null;
  rows: AsyncIterable<RoundMatrixRow>;
}

/**
 * One report the caller may download, listed on the dashboard's เอกสาร / รายงาน
 * card. Derived from a submitted round, never stored — see AVAILABLE_REPORT_KIND.
 */
export interface AvailableReport {
  /** Synthetic and stable: store + round (or overview) + format. */
  id: string;
  name: string;
  format: 'PDF' | 'XLSX';
  /** A submitted round is always renderable, so nothing else is reachable. */
  status: 'DONE';
  /** When the underlying round was submitted — the report's "วันที่สร้าง". */
  createdAt: Date;
  /** API route that renders this file; there is no stored artifact to link to. */
  downloadPath: string;
}
