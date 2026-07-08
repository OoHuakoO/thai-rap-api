export interface ProvinceDistribution {
  province: string;
  count: number;
  pct: number;
}

export interface StoreStats {
  total: number;
  targetTotal: number;
  t0CompletedCount: number;
  t1CompletedCount: number;
  passedCount: number;
  byProvince: ProvinceDistribution[];
}
