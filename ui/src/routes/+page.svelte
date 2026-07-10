<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { getAccessToken } from '$lib/api/client';

	if (browser) {
		getAccessToken().then((token) => {
			goto(token ? resolve('/dashboard') : resolve('/login'));
		});
	}
</script>

<div class="flex h-screen items-center justify-center">
	<p class="text-gray-600">Redirecting...</p>
</div>
