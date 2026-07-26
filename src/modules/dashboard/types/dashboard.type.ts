import type { Round } from '@prisma/client';

export type ActivityType = 'warning' | 'event' | 'announcement';

export interface DashboardKPIs {
  totalStores: number;
  targetStores: number;
  t0Completed: number;
  t0Percentage: number;
  t1Completed: number;
  t1Percentage: number;
  t2Completed: number;
  t2Percentage: number;
  t3Completed: number;
  t3Percentage: number;
  selectedStores: number;
  selectedPercentage: number;
  improvedStores: number;
  improvementRate: number;
  avgScore: number;
  lastUpdated: Date | null;
}

export interface ProvinceDistributionItem {
  province: string;
  count: number;
  percentage: number;
}

export interface Top20Entry {
  rank: number;
  storeId: string;
  storeName: string;
  province: string;
  storeType: string;
  t1Score: number;
}

export interface IncubationStep {
  label: string;
  count: number;
  percentage: number;
}

export interface StoreRoundScores {
  storeId: string;
  storeName: string;
  province: string;
  storeType: string;
  scores: Record<Round, number | null>;
}

export interface ProvinceComparison {
  province: string;
  fromRound: Round;
  toRound: Round;
  fromScore: number;
  toScore: number;
}

export interface ActivityItem {
  type: ActivityType;
  title: string;
  description: string;
  date: Date;
  urgent: boolean;
}

export interface ReportStatusItem {
  id: string;
  name: string;
  format: 'PDF' | 'XLSX' | 'CSV';
  createdAt: Date;
  status: 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';
  downloadUrl?: string;
}
