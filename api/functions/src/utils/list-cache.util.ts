import type {BaseModel} from "./model.util";
import type {PaginatedResult} from "./pagination.util";
import {cacheGet, cacheSet} from "./cache.util";
import {logger} from "./logger.util";

export interface PaginateOptions {
  limit: number;
  orderBy: string;
  orderDirection?: "asc" | "desc";
  cursor?: string | null | undefined;
}

async function loadAllFromFirestore<T extends BaseModel>(
  fetchFn: (cursor?: string) => Promise<PaginatedResult<T>>
): Promise<T[]> {
  const allItems: T[] = [];
  let cursor: string | undefined;

  try {
    while (true) {
      const result = await fetchFn(cursor);
      allItems.push(...result.data);

      if (!result.hasMore || !result.nextCursor) {
        break;
      }
      cursor = result.nextCursor;
    }
  } catch (err) {
    logger.error({err}, "Failed to load all items from Firestore");
    throw err;
  }

  return allItems;
}

export async function loadAll<T extends BaseModel>(
  cacheKey: string,
  fetchFn: (cursor?: string) => Promise<PaginatedResult<T>>,
  ttlSeconds: number
): Promise<T[]> {
  const cached = await cacheGet<T[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const allItems = await loadAllFromFirestore(fetchFn);
  await cacheSet(cacheKey, allItems, ttlSeconds);

  return allItems;
}

export function paginate<T extends BaseModel>(
  items: T[],
  options: PaginateOptions
): PaginatedResult<T> {
  if (!items || items.length === 0) {
    return {
      data: [],
      nextCursor: null,
      hasMore: false,
    };
  }

  // Sort items
  const sorted = [...items].sort((a, b) => {
    const aVal = a[options.orderBy as keyof T];
    const bVal = b[options.orderBy as keyof T];

    if (aVal === undefined || aVal === null) return 1;
    if (bVal === undefined || bVal === null) return -1;

    let cmp = 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      cmp = aVal.localeCompare(bVal);
    } else if (typeof aVal === "number" && typeof bVal === "number") {
      cmp = aVal - bVal;
    } else {
      cmp = String(aVal).localeCompare(String(bVal));
    }

    return options.orderDirection === "asc" ? cmp : -cmp;
  });

  // Find cursor position
  let startIndex = 0;
  if (options.cursor) {
    const cursorIndex = sorted.findIndex((item) => item.id === options.cursor);
    if (cursorIndex !== -1) {
      startIndex = cursorIndex + 1;
    }
  }

  // Slice by limit
  const sliced = sorted.slice(startIndex, startIndex + options.limit);
  const hasMore = startIndex + options.limit < sorted.length;

  return {
    data: sliced,
    nextCursor: hasMore && sliced.length > 0 ? sliced[sliced.length - 1].id : null,
    hasMore,
  };
}

export async function listAppend<T extends BaseModel>(
  cacheKey: string,
  item: T
): Promise<void> {
  const cached = await cacheGet<T[]>(cacheKey);
  if (!cached) return; // Cache miss, let next GET populate it

  cached.push(item);
  // Refresh TTL - maintain original 20-30 min TTL
  const ttl = 30 * 60; // Default to 30 min
  await cacheSet(cacheKey, cached, ttl);
}

export async function listUpdate<T extends BaseModel>(
  cacheKey: string,
  item: T
): Promise<void> {
  const cached = await cacheGet<T[]>(cacheKey);
  if (!cached) return;

  const index = cached.findIndex((i) => i.id === item.id);
  if (index !== -1) {
    cached[index] = item;
    const ttl = 30 * 60;
    await cacheSet(cacheKey, cached, ttl);
  }
}

export async function listRemove(
  cacheKey: string,
  id: string
): Promise<void> {
  const cached = await cacheGet<BaseModel[]>(cacheKey);
  if (!cached) return;

  const filtered = cached.filter((i) => i.id !== id);
  const ttl = 30 * 60;
  await cacheSet(cacheKey, filtered, ttl);
}
