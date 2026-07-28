import { SvelteSet } from 'svelte/reactivity';
import { confirmAsync } from './confirm.svelte';

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
		confirmFn?: (id: string) => boolean | Promise<boolean>
	): Promise<void>;

	isBatchDeleting: boolean;
	handleBatchDelete(
		deleteFn: (id: string) => Promise<unknown>,
		reload: () => Promise<void>,
		confirmFn?: (count: number) => boolean | Promise<boolean>
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
	const selectedIds: Set<string> = new SvelteSet();
	let isDeleting = $state(false);
	let deletingId = $state<string | null>(null);
	let isBatchDeleting = $state(false);
	let editModalOpen = $state(false);
	let editingItem = $state<T | null>(null);
	let editFormData = $state<Partial<T>>({});
	let error = $state('');

	return {
		get selectedIds() {
			return selectedIds;
		},
		get isDeleting() {
			return isDeleting;
		},
		get deletingId() {
			return deletingId;
		},
		get isBatchDeleting() {
			return isBatchDeleting;
		},
		get editModalOpen() {
			return editModalOpen;
		},
		get editingItem() {
			return editingItem;
		},
		get editFormData() {
			return editFormData;
		},
		get error() {
			return error;
		},

		toggleSelection(id) {
			if (selectedIds.has(id)) {
				selectedIds.delete(id);
			} else {
				selectedIds.add(id);
			}
		},

		toggleSelectAll(_allIds, visibleIds) {
			const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
			selectedIds.clear();
			if (!allSelected) {
				visibleIds.forEach((id) => selectedIds.add(id));
			}
		},

		clearSelection() {
			selectedIds.clear();
		},

		async handleSoftDelete(
			id,
			deleteFn,
			reload,
			confirmFn = () => confirmAsync('Archive item', 'Archive this item?', { danger: true })
		) {
			if (!(await confirmFn(id))) return;
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

		async handleBatchDelete(
			deleteFn,
			reload,
			confirmFn = (n) =>
				confirmAsync('Archive items', `Archive ${n} item(s)?`, { danger: true })
		) {
			if (selectedIds.size === 0) return;
			if (!(await confirmFn(selectedIds.size))) return;
			isBatchDeleting = true;
			error = '';
			try {
				const ids = Array.from(selectedIds);
				const results = await Promise.allSettled(ids.map((id) => deleteFn(id)));
				const failed = results
					.map((result, i) => ({ result, id: ids[i] }))
					.filter(({ result }) => result.status === 'rejected');

				// Clear/reload unconditionally so successfully-archived items stop
				// showing as present/selected, even when some deletes failed.
				selectedIds.clear();
				await reload();

				if (failed.length > 0) {
					error = `Failed to archive ${failed.length} of ${ids.length} item(s): ${failed
						.map(({ id }) => id)
						.join(', ')}`;
				}
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

		clearError() {
			error = '';
		}
	};
}
