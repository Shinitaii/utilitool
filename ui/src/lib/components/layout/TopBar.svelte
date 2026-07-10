<script lang="ts">
	import { page } from '$app/stores';

	interface Breadcrumb {
		label: string;
		href?: string;
	}

	interface Props {
		breadcrumbs?: Breadcrumb[];
		actions?: { label: string; action: () => void }[];
	}

	const { breadcrumbs = [], actions = [] }: Props = $props();

	function generateBreadcrumbs(): Breadcrumb[] {
		if (breadcrumbs.length > 0) {
			return breadcrumbs;
		}

		const path = $page.url.pathname;
		const parts = path.split('/').filter(Boolean);

		return [
			{ label: 'Home', href: '/dashboard' },
			...parts.map((part, idx) => ({
				label: part.charAt(0).toUpperCase() + part.slice(1),
				href: idx < parts.length - 1 ? '/' + parts.slice(0, idx + 1).join('/') : undefined
			}))
		];
	}

	const displayBreadcrumbs = generateBreadcrumbs();
</script>

<header
	class="flex h-[52px] items-center justify-between border-b border-gray-200 bg-white px-6"
	style="margin-left: 200px"
>
	<div class="flex items-center space-x-2 text-sm text-gray-600">
		{#each displayBreadcrumbs as crumb, idx (crumb.label + idx)}
			{#if idx > 0}
				<span class="text-gray-400">/</span>
			{/if}
			{#if crumb.href}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- breadcrumb hrefs are built dynamically from arbitrary route segments, not known statically -->
				<a href={crumb.href} class="hover:text-gray-900">{crumb.label}</a>
			{:else}
				<span>{crumb.label}</span>
			{/if}
		{/each}
	</div>

	<div class="flex items-center space-x-2">
		{#each actions as action (action.label)}
			<button
				onclick={action.action}
				class="rounded px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100"
			>
				{action.label}
			</button>
		{/each}
	</div>
</header>

<style>
	header {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 30;
	}
</style>
