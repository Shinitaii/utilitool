<script lang="ts">
	import { Trash2 } from 'lucide-svelte';

	interface Props {
		isClearing: boolean;
		onClick: () => void;
	}

	const { isClearing, onClick }: Props = $props();
</script>

<div class="flex justify-end">
	<button
		onclick={onClick}
		disabled={isClearing}
		class="flex items-center gap-2 rounded bg-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
	>
		<Trash2 size={16} />
		{isClearing ? 'Clearing...' : 'Clear Cache'}
	</button>
</div>
