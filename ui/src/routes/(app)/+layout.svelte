<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import TopBar from '$lib/components/layout/TopBar.svelte';
	import RightPanel from '$lib/components/layout/RightPanel.svelte';
	import ChatWidget from '$lib/components/shared/ChatWidget.svelte';
	import { authStore, initAuthListener, type AuthState } from '$lib/stores/auth.svelte';

	let { children } = $props();

	let authState = $state<AuthState>({
		isAuthenticated: false,
		user: null,
		isLoading: true,
		error: null
	});

	$effect(() => {
		const unsubscribeAuth = authStore.subscribe((state) => {
			authState = state;
		});
		const unsubscribeListener = initAuthListener();
		return () => {
			unsubscribeAuth();
			if (unsubscribeListener) unsubscribeListener();
		};
	});

	$effect(() => {
		if (!authState.isLoading && !authState.isAuthenticated) {
			goto(resolve('/login'));
		}
	});
</script>

<div class="flex h-screen w-full bg-gray-50">
	<Sidebar />

	<main class="flex flex-1 flex-col" style="margin-left: 200px">
		<TopBar />

		<div class="flex flex-1 overflow-hidden" style="margin-top: 52px">
			<div class="flex-1 overflow-auto">
				<div class="p-6">
					{@render children()}
				</div>
			</div>

			<RightPanel isOpen={false}>
				<p class="text-gray-500">Select an item to see details</p>
			</RightPanel>
		</div>
	</main>

	{#if authState.user?.role === 'admin'}
		<ChatWidget />
	{/if}
</div>
