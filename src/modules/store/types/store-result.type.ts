import type { StoreStatus } from '@prisma/client';

export interface StoreDocumentResult {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  url: string;
  uploadedAt: Date;
}

export interface StoreResult {
  id: string;
  name: string;
  province: string;
  storeType: string;
  ownerName: string;
  phone: string;
  email: string | null;
  address: string;
  socialLinks: Record<string, string>;
  avgRevenue: number | null;
  mainProblems: string[];
  goals: string[];
  photos: string[];
  logoUrl: string | null;
  storefrontPhotos: string[];
  documents: StoreDocumentResult[];
  status: StoreStatus;
  ownerId: string | null;
  latestScore: number | null;
  latestAssessorName: string | null;
  latestAssessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LatestAssessmentInfo {
  totalScore: number | null;
  submittedAt: Date | null;
  assessorName: string | null;
}
