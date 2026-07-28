<script lang="ts">
	import { Camera, Upload, Eye, RefreshCw } from 'lucide-svelte';

	let {
		imageUrl = null,
		alt = 'Captured meter reading photo',
		isBusy = false,
		disabled = false,
		onFile,
		onPreview
	}: {
		imageUrl?: string | null;
		alt?: string;
		isBusy?: boolean;
		disabled?: boolean;
		onFile: (file: File) => void;
		onPreview?: (imageUrl: string) => void;
	} = $props();

	let isDragging = $state(false);
	let inputEl: HTMLInputElement | undefined = $state();

	function openFilePicker() {
		if (disabled || isBusy) return;
		inputEl?.click();
	}

	function handleFileInputChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) onFile(file);
		(e.target as HTMLInputElement).value = '';
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		if (disabled || isBusy) return;
		const file = e.dataTransfer?.files?.[0];
		if (file && file.type.startsWith('image/')) onFile(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (disabled || isBusy) return;
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	function handlePreviewClick(e: MouseEvent) {
		if (!imageUrl || !onPreview) return;
		e.stopPropagation();
		onPreview(imageUrl);
	}
</script>

<!-- Clicking anywhere on the box (including the photo, if one is set) opens the
     file picker to add/replace a photo. Dragging a file over it does the same. -->
<div class="relative h-40 w-full">
	<button
		type="button"
		onclick={openFilePicker}
		ondrop={handleDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		{disabled}
		class="block h-full w-full overflow-hidden rounded border-2 border-dashed text-center transition disabled:cursor-not-allowed disabled:opacity-50"
		class:border-gray-300={!isDragging}
		class:bg-gray-50={!isDragging && !imageUrl}
		class:border-blue-400={isDragging}
		class:bg-blue-50={isDragging}
	>
		{#if imageUrl}
			<img src={imageUrl} {alt} class="h-full w-full object-cover" />
		{:else}
			<div class="flex h-full w-full flex-col items-center justify-center gap-1.5 text-gray-500">
				{#if isBusy}
					<Upload class="h-6 w-6 animate-pulse" />
					<span class="text-xs font-medium">Processing...</span>
				{:else}
					<Camera class="h-6 w-6" />
					<span class="px-2 text-xs font-medium">Click to add photo / drag photo here</span>
				{/if}
			</div>
		{/if}
	</button>

	{#if imageUrl && onPreview}
		<button
			type="button"
			onclick={handlePreviewClick}
			class="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
			aria-label="View full-size photo"
		>
			<Eye class="h-3.5 w-3.5" />
		</button>
	{/if}

	{#if imageUrl && !disabled}
		<div
			class="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white"
		>
			<RefreshCw class="h-3 w-3" />
			Click or drag to replace
		</div>
	{/if}
</div>

<input
	bind:this={inputEl}
	type="file"
	accept="image/*"
	class="hidden"
	{disabled}
	onchange={handleFileInputChange}
/>
