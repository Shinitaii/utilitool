export interface CrudStore<T extends { id: string }> {
  selectedIds: Set<string>;
  toggleSelection(id: string): void;
  toggleSelectAll(allIds: string[], visibleIds: string[]): void;
  clearSelection(): void;

  isDeleting: boolean;
  deletingId: string | null;
  handleSoftDelete(
    id: string,
    deleteFn: (id: string) => Promise<unknown>,
    reload: () => Promise<void>,
    confirmFn?: (id: string) => boolean
  ): Promise<void>;

  isBatchDeleting: boolean;
  handleBatchDelete(
    deleteFn: (id: string) => Promise<unknown>,
    reload: () => Promise<void>,
    confirmFn?: (count: number) => boolean
  ): Promise<void>;

  editModalOpen: boolean;
  editingItem: T | null;
  editFormData: Partial<T>;
  openEditModal(item: T, formData: Partial<T>): void;
  closeEditModal(): void;

  error: string;
  clearError(): void;
}

export function createCrudStore<T extends { id: string }>(): CrudStore<T> {
  let selectedIds = $state<Set<string>>(new Set());
  let isDeleting = $state(false);
  let deletingId = $state<string | null>(null);
  let isBatchDeleting = $state(false);
  let editModalOpen = $state(false);
  let editingItem = $state<T | null>(null);
  let editFormData = $state<Partial<T>>({});
  let error = $state('');

  return {
    get selectedIds() { return selectedIds; },
    get isDeleting() { return isDeleting; },
    get deletingId() { return deletingId; },
    get isBatchDeleting() { return isBatchDeleting; },
    get editModalOpen() { return editModalOpen; },
    get editingItem() { return editingItem; },
    get editFormData() { return editFormData; },
    get error() { return error; },

    toggleSelection(id) {
      const next = new Set(selectedIds);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      selectedIds = next;
    },

    toggleSelectAll(_allIds, visibleIds) {
      const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
      selectedIds = allSelected ? new Set() : new Set(visibleIds);
    },

    clearSelection() { selectedIds = new Set(); },

    async handleSoftDelete(id, deleteFn, reload, confirmFn = () => window.confirm('Archive this item?')) {
      if (!confirmFn(id)) return;
      deletingId = id;
      isDeleting = true;
      error = '';
      try {
        await deleteFn(id);
        await reload();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to archive item';
      } finally {
        deletingId = null;
        isDeleting = false;
      }
    },

    async handleBatchDelete(deleteFn, reload, confirmFn = (n) => window.confirm(`Archive ${n} item(s)?`)) {
      if (selectedIds.size === 0) return;
      if (!confirmFn(selectedIds.size)) return;
      isBatchDeleting = true;
      error = '';
      try {
        await Promise.all(Array.from(selectedIds).map(id => deleteFn(id)));
        selectedIds = new Set();
        await reload();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to archive items';
      } finally {
        isBatchDeleting = false;
      }
    },

    openEditModal(item, formData) {
      editingItem = item;
      editFormData = formData;
      editModalOpen = true;
    },

    closeEditModal() {
      editModalOpen = false;
      editingItem = null;
      editFormData = {};
    },

    clearError() { error = ''; }
  };
}
