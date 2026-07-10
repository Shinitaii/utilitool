<script lang="ts" generics="T extends { id: string }">
	import { RotateCcw } from 'lucide-svelte';
	import EmptyState from './EmptyState.svelte';

	interface Props {
		title: string;
		isEmpty: boolean;
		isLoading: boolean;
		error: string;
		items: T[];
		columns: {
			key: string;
			label: string;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- column values vary per feature (string/number/Firestore timestamp)
			format?: (value: any) => string;
		}[];
		onRestore: (id: string) => void;
		restoringId?: string | null;
	}

	const { title, isEmpty, isLoading, error, items, columns, onRestore, restoringId }: Props =
		$props();
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold">{title} Archive</h1>
		<p class="mt-1 text-gray-600">Archived items ({items.length})</p>
	</div>

	{#if error}
		<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
			{error}
		</div>
	{/if}

	<div class="overflow-x-auto rounded-lg border border-gray-200">
		{#if isEmpty}
			<div class="p-6">
				<EmptyState title="No archived items" message="Archived items will appear here" />
			</div>
		{:else}
			<table class="w-full text-sm">
				<thead class="border-b border-gray-200 bg-gray-50">
					<tr>
						{#each columns as column (column.key)}
							<th class="px-6 py-3 text-left font-semibold text-gray-700">{column.label}</th>
						{/each}
						<th class="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each items as item (item.id)}
						<tr class="border-b border-gray-200 hover:bg-gray-50">
							{#each columns as column (column.key)}
								{@const cellValue = (item as Record<string, unknown>)[column.key]}
								<td class="px-6 py-4 text-gray-700">
									{column.format ? column.format(cellValue) : cellValue}
								</td>
							{/each}
							<td class="px-6 py-4">
								<div class="flex gap-1">
									<button
										onclick={() => onRestore(item.id)}
										disabled={isLoading || restoringId === item.id}
										class="rounded p-1.5 text-green-700 hover:bg-green-100 disabled:opacity-50"
										title="Restore item"
									>
										<RotateCcw size={16} />
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>
