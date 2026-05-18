<script lang="ts">
	import { onMount } from 'svelte';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { initAuthListener } from '$lib/stores/auth.svelte';

	let { children } = $props();

	onMount(() => {
		initAuthListener();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
