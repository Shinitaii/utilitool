<script lang="ts">
	import { onMount } from 'svelte';
	import { getLlmConfig, upsertLlmConfig, upsertVisionLlmConfig } from '$lib/api/llm-config';
	import type { LlmProvider } from '$lib/types/llm-config.types';

	let activeTab = $state<'chat' | 'vision'>('chat');

	// Chat tab state
	let chatProvider = $state<LlmProvider>('groq');
	let chatModel = $state('');
	let chatApiKey = $state('');
	let chatHasKey = $state(false);

	// Vision (OCR) tab state
	let visionProvider = $state<LlmProvider>('groq');
	let visionModel = $state('');
	let visionApiKey = $state('');
	let visionHasKey = $state(false);

	let isLoading = $state(false);
	let isSaving = $state(false);
	let error = $state('');
	let success = $state('');

	const visionSharesChatProvider = $derived(visionProvider === chatProvider);

	onMount(async () => {
		await loadConfig();
	});

	async function loadConfig() {
		isLoading = true;
		error = '';
		try {
			const config = await getLlmConfig();
			if (config.provider) chatProvider = config.provider;
			if (config.model) chatModel = config.model;
			chatHasKey = config.hasKey;

			if (config.visionProvider) visionProvider = config.visionProvider;
			else if (config.provider) visionProvider = config.provider;
			if (config.visionModel) visionModel = config.visionModel;
			visionHasKey = config.visionHasKey;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load LLM config';
		} finally {
			isLoading = false;
		}
	}

	async function handleSubmitChat(e: Event) {
		e.preventDefault();
		isSaving = true;
		error = '';
		success = '';

		try {
			const result = await upsertLlmConfig({
				provider: chatProvider,
				model: chatModel,
				apiKey: chatApiKey
			});
			chatHasKey = result.hasKey;
			chatApiKey = '';
			success = 'Chat provider settings saved';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save chat provider config';
		} finally {
			isSaving = false;
		}
	}

	async function handleSubmitVision(e: Event) {
		e.preventDefault();
		isSaving = true;
		error = '';
		success = '';

		try {
			const result = await upsertVisionLlmConfig({
				provider: visionProvider,
				model: visionModel,
				apiKey: visionApiKey || undefined
			});
			visionHasKey = result.visionHasKey;
			visionApiKey = '';
			success = 'Vision (OCR) provider settings saved';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save vision provider config';
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold">LLM Provider</h1>
		<p class="text-gray-600">
			Configure separate AI providers for the insight chatbot and for photo OCR — some providers
			don't offer a usable free vision model, so you can mix and match.
		</p>
	</div>

	<div class="flex gap-2 border-b border-gray-200">
		<button
			type="button"
			class="border-b-2 px-4 py-2 text-sm font-medium"
			style={activeTab === 'chat'
				? 'border-color: var(--color-accent); color: var(--color-accent)'
				: 'border-color: transparent; color: #6b7280'}
			onclick={() => (activeTab = 'chat')}
		>
			Chatbot
		</button>
		<button
			type="button"
			class="border-b-2 px-4 py-2 text-sm font-medium"
			style={activeTab === 'vision'
				? 'border-color: var(--color-accent); color: var(--color-accent)'
				: 'border-color: transparent; color: #6b7280'}
			onclick={() => (activeTab = 'vision')}
		>
			Vision (OCR)
		</button>
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
		{:else if activeTab === 'chat'}
			<form class="space-y-4" onsubmit={handleSubmitChat}>
				<p class="text-sm text-gray-600">Used by the insight chatbot.</p>

				<div>
					<label for="chatProvider" class="block text-sm font-medium text-gray-700">Provider</label
					>
					<select
						id="chatProvider"
						bind:value={chatProvider}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
					>
						<option value="groq">Groq</option>
						<option value="ollama_cloud">Ollama Cloud</option>
					</select>
				</div>

				<div>
					<label for="chatModel" class="block text-sm font-medium text-gray-700">Model</label>
					<input
						id="chatModel"
						type="text"
						bind:value={chatModel}
						placeholder="e.g. llama-3.3-70b-versatile"
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
					/>
				</div>

				<div>
					<label for="chatApiKey" class="block text-sm font-medium text-gray-700">
						API Key {chatHasKey ? '(saved — enter a new value to replace)' : ''}
					</label>
					<input
						id="chatApiKey"
						type="password"
						bind:value={chatApiKey}
						placeholder={chatHasKey ? '••••••••' : 'Enter API key'}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
					/>
					<p class="mt-1 text-xs text-gray-500">
						Your API key is encrypted before storage and is never shown again after saving.
					</p>
				</div>

				<button
					type="submit"
					disabled={isSaving || !chatModel || (!chatApiKey && !chatHasKey)}
					class="rounded px-4 py-2 font-medium text-white disabled:opacity-50"
					style="background-color: var(--color-accent)"
				>
					{isSaving ? 'Saving...' : 'Save'}
				</button>
			</form>
		{:else}
			<form class="space-y-4" onsubmit={handleSubmitVision}>
				<p class="text-sm text-gray-600">
					Used to read meter photos and utility bill photos. Independent from the chatbot
					provider above — pick whichever provider actually has a usable vision model for you.
				</p>

				<div>
					<label for="visionProvider" class="block text-sm font-medium text-gray-700"
						>Provider</label
					>
					<select
						id="visionProvider"
						bind:value={visionProvider}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
					>
						<option value="groq">Groq</option>
						<option value="ollama_cloud">Ollama Cloud</option>
					</select>
				</div>

				<div>
					<label for="visionModel" class="block text-sm font-medium text-gray-700">Model</label>
					<input
						id="visionModel"
						type="text"
						bind:value={visionModel}
						placeholder="e.g. meta-llama/llama-4-scout-17b-16e-instruct"
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
					/>
				</div>

				<div>
					<label for="visionApiKey" class="block text-sm font-medium text-gray-700">
						API Key {visionHasKey ? '(saved — enter a new value to replace)' : ''}
					</label>
					<input
						id="visionApiKey"
						type="password"
						bind:value={visionApiKey}
						placeholder={visionSharesChatProvider
							? 'Same provider as chatbot — leave blank to reuse that key'
							: visionHasKey
								? '••••••••'
								: 'Enter API key'}
						class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
					/>
					{#if visionSharesChatProvider}
						<p class="mt-1 text-xs text-gray-500">
							Provider matches the chatbot's — leave blank to reuse that API key, or enter one
							here to use a different key for vision.
						</p>
					{:else}
						<p class="mt-1 text-xs text-gray-500">
							Provider differs from the chatbot's — an API key for this provider is required.
						</p>
					{/if}
				</div>

				<button
					type="submit"
					disabled={isSaving ||
						!visionModel ||
						(!visionSharesChatProvider && !visionApiKey && !visionHasKey)}
					class="rounded px-4 py-2 font-medium text-white disabled:opacity-50"
					style="background-color: var(--color-accent)"
				>
					{isSaving ? 'Saving...' : 'Save'}
				</button>
			</form>
		{/if}
	</div>
</div>
