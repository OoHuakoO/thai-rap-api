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
  code: string;
  name: string;
  province: string | null;
  storeType: string | null;
  ownerName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  socialLinks: Record<string, string>;
  avgRevenueMin: number | null;
  avgRevenueMax: number | null;
  mainProblems: string[];
  goals: string[];
  menuPhotos: string[];
  coverUrl: string | null;
  storePhotos: string[];
  documents: StoreDocumentResult[];
  status: StoreStatus;
  ownerId: string | null;
  latestScore: number | null;
  latestAssessorName: string | null;
  latestAssessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// What a caller receives for a store whose private data is not theirs: every
// store for a VIEWER, and someone else's store for an ENTREPRENEUR. Mirrors
// PUBLIC_STORE_FIELDS in ../thai-rap-web/constants/permissions.ts — contact
// details, revenue, documents and scores are excluded on purpose, so adding a
// key here without adding it there (and vice versa) breaks the contract.
// coverUrl rides along with the photo fields: it is the same class of asset.
// ownerId is not a display field — it is how the client tells its own store
// apart from the rest — and an opaque id discloses nothing about the business.
export type PublicStoreResult = Pick<
  StoreResult,
  | 'id'
  | 'ownerId'
  | 'code'
  | 'name'
  | 'province'
  | 'storeType'
  | 'socialLinks'
  | 'goals'
  | 'menuPhotos'
  | 'coverUrl'
  | 'storePhotos'
  | 'status'
>;

export interface LatestAssessmentInfo {
  totalScore: number | null;
  submittedAt: Date | null;
  assessorName: string | null;
}
