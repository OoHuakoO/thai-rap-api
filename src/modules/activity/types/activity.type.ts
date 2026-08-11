export interface ActivityPhotoItem {
  id: string;
  url: string;
  sortOrder: number;
  uploadedAt: Date;
}

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  note: string | null;
  activityDate: Date;
  location: string | null;
  photoCount: number;
  photos: ActivityPhotoItem[];
  createdById: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}
