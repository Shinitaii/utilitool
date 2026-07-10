<script lang="ts">
	interface Props {
		title?: string;
		message?: string;
	}

	const { title = 'Nothing here', message = 'No data to display' }: Props = $props();
</script>

<div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
	<p class="text-gray-600">{title}</p>
	<p class="mt-1 text-sm text-gray-500">{message}</p>
</div>
