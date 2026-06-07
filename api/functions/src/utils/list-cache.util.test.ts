jest.mock('./cache.util');
jest.mock('./logger.util', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { describe, it, expect, jest } from '@jest/globals';
import { fetchAllPages, paginate } from './list-cache.util';
import type { PaginatedResult } from './pagination.util';
import type { BaseModel } from './model.util';

interface Item extends BaseModel {
  id: string;
}

const page = (id: string, hasMore: boolean): PaginatedResult<Item> => ({
  data: [{ id } as Item],
  hasMore,
  nextCursor: hasMore ? id : null,
});

describe('fetchAllPages - bounded pagination guard', () => {
  it('aggregates pages until hasMore is false', async () => {
    const fetchFn = jest.fn<(cursor?: string) => Promise<PaginatedResult<Item>>>()
      .mockResolvedValueOnce(page('a', true))
      .mockResolvedValueOnce(page('b', true))
      .mockResolvedValueOnce(page('c', false));

    const items = await fetchAllPages(fetchFn);

    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('aborts instead of looping forever when hasMore never reports false', async () => {
    // Simulates a misreporting data source (bad cursor, schema drift, bug) —
    // without a bound this would loop until the process OOMs.
    const fetchFn = jest.fn<(cursor?: string) => Promise<PaginatedResult<Item>>>()
      .mockImplementation(async () => page('x', true));

    await expect(fetchAllPages(fetchFn)).rejects.toThrow(/exceeded \d+ pages/);
  });
});

describe('paginate', () => {
  it('paginates an in-memory array by cursor', () => {
    const items: Item[] = [{ id: 'a' } as Item, { id: 'b' } as Item, { id: 'c' } as Item];

    const result = paginate(items, { limit: 2, orderBy: 'id', orderDirection: 'asc' });

    expect(result.data.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('b');
  });
});
