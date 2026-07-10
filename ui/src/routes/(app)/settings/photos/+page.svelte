<script lang="ts">
	import { onMount } from 'svelte';
	import { getPhotoSettings, upsertPhotoSettings } from '$lib/api/photo-settings';

	let savePhotos = $state(false);
	let isLoading = $state(false);
	let isSaving = $state(false);
	let error = $state('');
	let success = $state('');

	onMount(async () => {
		await loadSettings();
	});

	async function loadSettings() {
		isLoading = true;
		error = '';
		try {
			const settings = await getPhotoSettings();
			savePhotos = settings.savePhotos;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load photo settings';
		} finally {
			isLoading = false;
		}
	}

	async function handleToggle() {
		const next = !savePhotos;
		isSaving = true;
		error = '';
		success = '';
		try {
			const result = await upsertPhotoSettings({ savePhotos: next });
			savePhotos = result.savePhotos;
			success = 'Photo setting saved';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save photo setting';
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold">Photo Settings</h1>
		<p class="text-gray-600">
			Control whether meter-reading photos are kept after being used for OCR suggestions.
		</p>
	</div>

	<div class="rounded-lg border border-gray-200 bg-white p-6">
		{#if error}
			<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
				{error}
			</div>
		{/if}

		{#if success}
			<div class="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-700">
				{success}
			</div>
		{/if}

		{#if isLoading}
			<p class="text-sm text-gray-500">Loading...</p>
		{:else}
			<div class="flex items-start justify-between gap-4">
				<div>
					<h3 class="text-sm font-medium text-gray-900">Save meter-reading photos</h3>
					<p class="mt-1 text-sm text-gray-600">
						When off (default), a captured photo is only used in-memory to suggest a reading
						value — it's discarded before the reading is submitted, never stored. When on, the
						photo is kept and attached to the reading.
					</p>
					<p class="mt-2 text-xs text-gray-500">
						Applies to meter-reading photos on web and mobile. Utility-bill photos used for
						billing-cycle OCR are never saved either way.
					</p>
				</div>
				<button
					type="button"
					role="switch"
					aria-checked={savePhotos}
					aria-label="Save meter-reading photos"
					onclick={handleToggle}
					disabled={isSaving}
					class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
					style="background-color: {savePhotos ? 'var(--color-accent)' : '#d1d5db'}"
				>
					<span
						class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
						style="transform: translateX({savePhotos ? '1.5rem' : '0.25rem'})"
					></span>
				</button>
			</div>
		{/if}
	</div>
</div>
