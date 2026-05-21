import { describe, it, expect, vi } from 'vitest';
import { createCrudStore } from './crud.svelte';

type Item = { id: string; name: string };

function mockDelete(failIds: string[] = []) {
  return vi.fn(async (id: string) => {
    if (failIds.includes(id)) throw new Error(`Delete failed for ${id}`);
  });
}

function mockReload() {
  return vi.fn(async () => {});
}

describe('createCrudStore — selection', () => {
  it('starts empty', () => {
    const store = createCrudStore<Item>();
    expect(store.selectedIds.size).toBe(0);
  });

  it('toggleSelection adds an id', () => {
    const store = createCrudStore<Item>();
    store.toggleSelection('a');
    expect(store.selectedIds.has('a')).toBe(true);
  });

  it('toggleSelection removes an existing id', () => {
    const store = createCrudStore<Item>();
    store.toggleSelection('a');
    store.toggleSelection('a');
    expect(store.selectedIds.has('a')).toBe(false);
  });

  it('toggleSelectAll selects all provided ids', () => {
    const store = createCrudStore<Item>();
    store.toggleSelectAll(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(store.selectedIds.size).toBe(3);
  });

  it('toggleSelectAll clears when all already selected', () => {
    const store = createCrudStore<Item>();
    store.toggleSelectAll(['a', 'b'], ['a', 'b']);
    store.toggleSelectAll(['a', 'b'], ['a', 'b']);
    expect(store.selectedIds.size).toBe(0);
  });

  it('clearSelection resets to empty', () => {
    const store = createCrudStore<Item>();
    store.toggleSelection('a');
    store.clearSelection();
    expect(store.selectedIds.size).toBe(0);
  });
});

describe('createCrudStore — soft delete', () => {
  it('calls deleteFn with the id', async () => {
    const store = createCrudStore<Item>();
    const del = mockDelete();
    await store.handleSoftDelete('id-1', del, mockReload(), () => true);
    expect(del).toHaveBeenCalledWith('id-1');
  });

  it('calls reload after delete', async () => {
    const store = createCrudStore<Item>();
    const reload = mockReload();
    await store.handleSoftDelete('id-1', mockDelete(), reload, () => true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('skips when confirm returns false', async () => {
    const store = createCrudStore<Item>();
    const del = mockDelete();
    await store.handleSoftDelete('id-1', del, mockReload(), () => false);
    expect(del).not.toHaveBeenCalled();
  });

  it('sets error when deleteFn throws', async () => {
    const store = createCrudStore<Item>();
    const reload = mockReload();
    await store.handleSoftDelete('id-1', mockDelete(['id-1']), reload, () => true);
    expect(store.error).toContain('Delete failed');
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('createCrudStore — batch delete', () => {
  it('calls deleteFn for each selected id', async () => {
    const store = createCrudStore<Item>();
    store.toggleSelection('a');
    store.toggleSelection('b');
    const del = mockDelete();
    await store.handleBatchDelete(del, mockReload(), () => true);
    expect(del).toHaveBeenCalledWith('a');
    expect(del).toHaveBeenCalledWith('b');
  });

  it('clears selection after batch delete', async () => {
    const store = createCrudStore<Item>();
    store.toggleSelection('a');
    await store.handleBatchDelete(mockDelete(), mockReload(), () => true);
    expect(store.selectedIds.size).toBe(0);
  });
});

describe('createCrudStore — edit modal', () => {
  it('openEditModal sets state', () => {
    const store = createCrudStore<Item>();
    store.openEditModal({ id: 'x', name: 'Test' }, { name: 'Test' });
    expect(store.editingItem?.id).toBe('x');
    expect(store.editModalOpen).toBe(true);
  });

  it('closeEditModal resets state', () => {
    const store = createCrudStore<Item>();
    store.openEditModal({ id: 'x', name: 'Test' }, {});
    store.closeEditModal();
    expect(store.editModalOpen).toBe(false);
    expect(store.editingItem).toBeNull();
  });
});
