import type { PaginationMeta, PaginatedResult } from '../common/types/api-response.type';

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export function normalizePagination(params: PaginationParams): {
  skip: number;
  take: number;
  page: number;
  limit: number;
} {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 10));
  const skip = (page - 1) * limit;
  return { skip, take: limit, page, limit };
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return { items, meta: buildPaginationMeta(total, page, limit) };
}
