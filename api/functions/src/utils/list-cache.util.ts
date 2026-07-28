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

// Safety bound for unbounded "load everything" pagination loops below: at 1000
// items/page, this caps a single load at 200k items. If a Firestore response
// ever misreports `hasMore`/`nextCursor` (bug, bad cursor, schema drift), these
// loops would otherwise run forever and OOM the Cloud Function — abort instead.
const MAX_LOAD_ALL_PAGES = 200;

export async function fetchAllPages<T extends BaseModel>(
  fetchFn: (cursor?: string) => Promise<PaginatedResult<T>>
): Promise<T[]> {
  const allItems: T[] = [];
  let cursor: string | undefined;
  let pages = 0;

  while (true) {
    const result = await fetchFn(cursor);
    allItems.push(...result.data);
    pages++;

    if (!result.hasMore || !result.nextCursor) {
      break;
    }
    if (pages >= MAX_LOAD_ALL_PAGES) {
      throw new Error(
        `Pagination exceeded ${MAX_LOAD_ALL_PAGES} pages (${allItems.length} items) without ` +
        "reporting hasMore=false — aborting to prevent unbounded memory growth. " +
        "This likely indicates a bad cursor or a misreported hasMore from the data source."
      );
    }
    cursor = result.nextCursor;
  }

  return allItems;
}

async function loadAllFromFirestore<T extends BaseModel>(
  fetchFn: (cursor?: string) => Promise<PaginatedResult<T>>
): Promise<T[]> {
  try {
    return await fetchAllPages(fetchFn);
  } catch (err) {
    logger.error({err}, "Failed to load all items from Firestore");
    throw err;
  }
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
  item: T,
  ttlSeconds: number = 30 * 60
): Promise<void> {
  return listAppendMany(cacheKey, [item], ttlSeconds);
}

export async function listUpdate<T extends BaseModel>(
  cacheKey: string,
  item: T
): Promise<void> {
  return listUpdateMany(cacheKey, [item]);
}

export async function listRemove(
  cacheKey: string,
  id: string
): Promise<void> {
  return listRemoveMany(cacheKey, [id]);
}

/**
 * Batch variants of listAppend/listUpdate/listRemove: one cacheGet + one cacheSet for the
 * whole batch instead of one round-trip pair per item. Also correctness-critical, not just an
 * optimization — the list cache is a single read-modify-write key, so calling the single-item
 * versions concurrently (e.g. via Promise.all across a batch) would race: two calls can both
 * read the same stale array and the second write clobbers the first, silently dropping an item.
 */
export async function listAppendMany<T extends BaseModel>(
  cacheKey: string,
  items: T[],
  ttlSeconds: number = 30 * 60
): Promise<void> {
  if (items.length === 0) return;
  const cached = await cacheGet<T[]>(cacheKey);
  if (!cached) return; // Cache miss, let next GET populate it

  cached.push(...items);
  await cacheSet(cacheKey, cached, ttlSeconds);
}

export async function listUpdateMany<T extends BaseModel>(
  cacheKey: string,
  items: T[]
): Promise<void> {
  if (items.length === 0) return;
  const cached = await cacheGet<T[]>(cacheKey);
  if (!cached) return;

  const byId = new Map(items.map((item) => [item.id, item]));
  const updated = cached.map((existing) => byId.get(existing.id) ?? existing);
  const ttl = 30 * 60;
  await cacheSet(cacheKey, updated, ttl);
}

export async function listRemoveMany(
  cacheKey: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const cached = await cacheGet<BaseModel[]>(cacheKey);
  if (!cached) return;

  const idSet = new Set(ids);
  const filtered = cached.filter((i) => !idSet.has(i.id));
  const ttl = 30 * 60;
  await cacheSet(cacheKey, filtered, ttl);
}
