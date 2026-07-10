<script lang="ts">
	import { onMount } from 'svelte';
	import { getLlmConfig, upsertLlmConfig } from '$lib/api/llm-config';
	import type { LlmProvider } from '$lib/types/llm-config.types';

	let provider = $state<LlmProvider>('groq');
	let model = $state('');
	let apiKey = $state('');
	let hasKey = $state(false);

	let isLoading = $state(false);
	let isSaving = $state(false);
	let error = $state('');
	let success = $state('');

	onMount(async () => {
		await loadConfig();
	});

	async function loadConfig() {
		isLoading = true;
		error = '';
		try {
			const config = await getLlmConfig();
			if (config.provider) provider = config.provider;
			if (config.model) model = config.model;
			hasKey = config.hasKey;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load LLM config';
		} finally {
			isLoading = false;
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		isSaving = true;
		error = '';
		success = '';

		try {
			const result = await upsertLlmConfig({ provider, model, apiKey });
			hasKey = result.hasKey;
			apiKey = '';
			success = 'LLM provider settings saved';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save LLM config';
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold">LLM Provider</h1>
		<p class="text-gray-600">Configure the AI provider and API key for the insight chatbot</p>
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
			<form class="space-y-4" onsubmit={handleSubmit}>
				<div>
					<label for="provider" class="block text-sm font-medium text-gray-700">Provider</label>
					<select
						id="provider"
						bind:value={provider}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
					>
						<option value="groq">Groq</option>
						<option value="ollama_cloud">Ollama Cloud</option>
					</select>
				</div>

				<div>
					<label for="model" class="block text-sm font-medium text-gray-700">Model</label>
					<input
						id="model"
						type="text"
						bind:value={model}
						placeholder="e.g. llama-3.3-70b-versatile"
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
					/>
				</div>

				<div>
					<label for="apiKey" class="block text-sm font-medium text-gray-700">
						API Key {hasKey ? '(saved — enter a new value to replace)' : ''}
					</label>
					<input
						id="apiKey"
						type="password"
						bind:value={apiKey}
						placeholder={hasKey ? '••••••••' : 'Enter API key'}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
					/>
					<p class="mt-1 text-xs text-gray-500">
						Your API key is encrypted before storage and is never shown again after saving.
					</p>
				</div>

				<button
					type="submit"
					disabled={isSaving || !model || (!apiKey && !hasKey)}
					class="rounded px-4 py-2 font-medium text-white disabled:opacity-50"
					style="background-color: var(--color-accent)"
				>
					{isSaving ? 'Saving...' : 'Save'}
				</button>
			</form>
		{/if}
	</div>
</div>
