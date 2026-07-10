<script lang="ts">
	let { children } = $props();
</script>

<div class="flex h-screen w-full items-center justify-center bg-gray-50">
	<div class="w-full max-w-md">
		{@render children()}
	</div>
</div>
