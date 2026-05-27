import type { BaseModel, WithoutBaseModel } from "../utils/model.util";
import type { PaginatedResult } from "../utils/pagination.util";
import type { Repository, SearchOptions } from "./repository.lib";
import { cacheGet, cacheSet, cacheDel } from "../utils/cache.util";
import { loadAll, listAppend, listUpdate, listRemove, paginate } from "../utils/list-cache.util";

/**
 * CachedRepository wraps Repository<T> with a two-tier caching strategy:
 *
 * 1. ID Cache: Individual items cached by `{featureName}:id:{id}` (global, not user-scoped)
 * 2. List Cache: Full list cached by `{featureName}:all:{userId}` (per-user)
 *
 * This layer ensures:
 * - Atomic cache updates on mutations (both tiers updated together)
 * - User-scoped list caching (different users get different cached lists)
 * - Proper TTL management (passed from service, not hardcoded)
 * - Graceful fallback if Redis is unavailable
 */
export class CachedRepository<T extends BaseModel> {
  constructor(
    private repo: Repository<T>,
    private userId: string,
    private featureName: string,
    private cacheTTL: number
  ) {}

  /**
   * Get single item by ID, checking ID cache first.
   * Misses populate the ID cache for future reads.
   */
  async getById(id: string): Promise<T | null> {
    const idKey = this.idCacheKey(id);
    const cached = await cacheGet<T>(idKey);
    if (cached) return cached;

    const doc = await this.repo.getById(id);
    if (doc) {
      await cacheSet(idKey, doc, this.cacheTTL);
    }
    return doc;
  }

  /**
   * Search with optional filters. For archived=true, bypasses cache.
   * For active items, uses list cache approach: load all, filter in memory, paginate.
   */
  async search(options: SearchOptions<T>): Promise<PaginatedResult<T>> {
    // Archive queries go direct to Firestore (rare, admin use)
    if (options.archived) {
      return this.repo.search(options);
    }

    // Load all active items from cache (or Firestore if cache cold)
    const allItems = await loadAll(
      this.listCacheKey(),
      (cursor) => this.repo.search({
        limit: 1000,
        orderBy: options.orderBy,
        orderDirection: options.orderDirection ?? "desc",
        cursor,
        archived: false,
        filters: {},
      }),
      this.cacheTTL
    );

    // Apply filters in memory
    let filtered = allItems;
    if (options.filters) {
      filtered = allItems.filter((item) => {
        return Object.entries(options.filters!).every(([field, value]) => {
          if (value === undefined) return true;
          return (item as any)[field] === value;
        });
      });
    }

    // Paginate over filtered results
    const result = paginate(filtered, {
      limit: options.limit,
      orderBy: options.orderBy as string,
      orderDirection: options.orderDirection,
      cursor: options.cursor,
    });

    return result;
  }

  /**
   * Load ALL items (no pagination), cached by user.
   * Useful for operations that need the full dataset.
   */
  async searchAll(options: Omit<SearchOptions<T>, 'limit' | 'cursor'>): Promise<T[]> {
    // Archive queries go direct to Firestore
    if (options.archived) {
      let allItems: T[] = [];
      let cursor: string | undefined;

      while (true) {
        const result = await this.repo.search({
          limit: 1000,
          orderBy: options.orderBy,
          orderDirection: options.orderDirection,
          cursor,
          archived: true,
          filters: options.filters,
        });

        allItems.push(...result.data);
        if (!result.hasMore || !result.nextCursor) break;
        cursor = result.nextCursor;
      }

      return allItems;
    }

    // Load all active items from cache
    const allItems = await loadAll(
      this.listCacheKey(),
      (cursor) => this.repo.search({
        limit: 1000,
        orderBy: options.orderBy,
        orderDirection: options.orderDirection ?? "desc",
        cursor,
        archived: false,
        filters: {},
      }),
      this.cacheTTL
    );

    // Apply filters in memory
    let filtered = allItems;
    if (options.filters) {
      filtered = allItems.filter((item) => {
        return Object.entries(options.filters!).every(([field, value]) => {
          if (value === undefined) return true;
          return (item as any)[field] === value;
        });
      });
    }

    return filtered;
  }

  /**
   * Create single item. Updates both ID cache and list cache.
   */
  async create(data: WithoutBaseModel<T>): Promise<T> {
    const created = await this.repo.create(data);

    // Update both cache tiers
    await cacheSet(this.idCacheKey(created.id), created, this.cacheTTL);
    await listAppend(this.listCacheKey(), created);

    return created;
  }

  /**
   * Batch create. Updates both cache tiers for all items.
   */
  async createBatch(documents: WithoutBaseModel<T>[]): Promise<T[]> {
    const created = await this.repo.createBatch(documents);

    // Update both cache tiers for each item
    for (const item of created) {
      await cacheSet(this.idCacheKey(item.id), item, this.cacheTTL);
      await listAppend(this.listCacheKey(), item);
    }

    return created;
  }

  /**
   * Update single item. Updates both ID cache and list cache.
   */
  async update(id: string, data: Partial<WithoutBaseModel<T>>): Promise<T> {
    const updated = await this.repo.update(id, data);

    // Update both cache tiers
    await cacheSet(this.idCacheKey(id), updated, this.cacheTTL);
    await listUpdate(this.listCacheKey(), updated);

    return updated;
  }

  /**
   * Batch update. Updates both cache tiers for all items.
   */
  async updateBatch(updates: { id: string; data: Partial<WithoutBaseModel<T>> }[]): Promise<T[]> {
    const updated = await this.repo.updateBatch(updates);

    // Update both cache tiers for each item
    for (const item of updated) {
      await cacheSet(this.idCacheKey(item.id), item, this.cacheTTL);
      await listUpdate(this.listCacheKey(), item);
    }

    return updated;
  }

  /**
   * Hard delete. Invalidates both cache tiers.
   */
  async delete(id: string): Promise<void> {
    await this.repo.delete(id);

    // Invalidate both cache tiers
    await cacheDel(this.idCacheKey(id));
    await listRemove(this.listCacheKey(), id);
  }

  /**
   * Batch hard delete. Invalidates both cache tiers for all items.
   */
  async deleteBatch(ids: string[]): Promise<void> {
    await this.repo.deleteBatch(ids);

    // Invalidate both cache tiers for each item
    for (const id of ids) {
      await cacheDel(this.idCacheKey(id));
      await listRemove(this.listCacheKey(), id);
    }
  }

  /**
   * Soft delete (mark as deleted). Invalidates both cache tiers.
   */
  async softDelete(id: string): Promise<T> {
    const deleted = await this.repo.softDelete(id);

    // Invalidate both cache tiers
    await cacheDel(this.idCacheKey(id));
    await listRemove(this.listCacheKey(), id);

    return deleted;
  }

  /**
   * Batch soft delete. Invalidates both cache tiers for all items.
   */
  async softDeleteBatch(ids: string[]): Promise<T[]> {
    const deleted = await this.repo.softDeleteBatch(ids);

    // Invalidate both cache tiers for each item
    for (const id of ids) {
      await cacheDel(this.idCacheKey(id));
      await listRemove(this.listCacheKey(), id);
    }

    return deleted;
  }

  /**
   * Restore (undelete). Updates both cache tiers.
   */
  async restore(id: string): Promise<T> {
    const restored = await this.repo.restore(id);

    // Update both cache tiers
    await cacheSet(this.idCacheKey(id), restored, this.cacheTTL);
    await listAppend(this.listCacheKey(), restored);

    return restored;
  }

  /**
   * Generate ID cache key: `utilitool:{featureName}:id:{id}`
   */
  private idCacheKey(id: string): string {
    return `utilitool:${this.featureName}:id:${id}`;
  }

  /**
   * Generate list cache key: `utilitool:{featureName}:all:{userId}`
   */
  private listCacheKey(): string {
    return `utilitool:${this.featureName}:all:${this.userId}`;
  }
}
