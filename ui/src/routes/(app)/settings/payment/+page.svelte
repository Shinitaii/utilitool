<script lang="ts">
	import { authStore, type AuthState } from '$lib/stores/auth.svelte';
	import { updateMe } from '$lib/api/auth';
	import { uploadToStorage } from '$lib/utils/firebase-storage';

	let isLoading = $state(false);
	let error = $state('');
	let success = $state('');
	let isUploading = $state(false);

	let auth = $state<AuthState | null>(null);

	$effect(() => {
		const unsubscribe = authStore.subscribe((value) => {
			auth = value;
		});
		return unsubscribe;
	});

	async function handleFileUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		if (!file.type.startsWith('image/')) {
			error = 'Please upload an image file';
			return;
		}

		if (!auth?.user) {
			error = 'You must be signed in to upload a QR code';
			return;
		}

		isUploading = true;
		error = '';
		success = '';

		try {
			const storagePath = `qr-payments/${auth.user.userId}/${file.name}`;
			const url = await uploadToStorage(file, storagePath);

			await updateMe({ qr_payment_url: url });

			authStore.setUser({
				...auth.user,
				qr_payment_url: url
			});

			success = 'QR code uploaded successfully';
			input.value = '';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to upload QR code';
		} finally {
			isUploading = false;
		}
	}

	async function handleRemoveQR() {
		if (!auth?.user) {
			error = 'You must be signed in to remove the QR code';
			return;
		}

		isLoading = true;
		error = '';
		success = '';

		try {
			await updateMe({ qr_payment_url: '' });
			authStore.setUser({
				...auth.user,
				qr_payment_url: undefined
			});
			success = 'QR code removed successfully';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to remove QR code';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold">Payment Settings</h1>
		<p class="text-gray-600">Manage your payment QR code for tenant receipts</p>
	</div>

	<div class="rounded-lg border border-gray-200 bg-white p-6">
		<h2 class="mb-6 text-xl font-semibold">Payment QR Code</h2>

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

		<div class="space-y-6">
			{#if auth?.user?.qr_payment_url}
				<div class="space-y-4">
					<p class="text-sm text-gray-600">Current QR Code:</p>
					<div class="flex justify-center">
						<img
							src={auth?.user?.qr_payment_url || ''}
							alt="Payment QR Code"
							class="h-64 w-64 rounded-lg border border-gray-200"
						/>
					</div>
					<button
						type="button"
						onclick={handleRemoveQR}
						disabled={isLoading}
						class="w-full rounded px-4 py-2 font-medium text-white transition-opacity disabled:opacity-50"
						style="background-color: #a23b21"
					>
						{isLoading ? 'Removing...' : 'Remove QR Code'}
					</button>
				</div>
			{/if}

			<div class="space-y-3">
				<label for="qr-upload" class="block text-sm font-medium text-gray-700">
					{auth?.user?.qr_payment_url ? 'Replace QR Code' : 'Upload QR Code'}
				</label>
				<input
					id="qr-upload"
					type="file"
					accept="image/*"
					onchange={handleFileUpload}
					disabled={isUploading}
					class="block w-full rounded border border-gray-300 px-3 py-2 text-sm"
				/>
				<p class="text-xs text-gray-500">
					Upload a GCash or Maya QR code image. This will be displayed on tenant payment receipts.
				</p>
			</div>

			{#if isUploading}
				<div class="rounded-lg bg-blue-50 p-4 text-sm text-blue-700">Uploading QR code...</div>
			{/if}
		</div>
	</div>

	<div class="rounded-lg border border-gray-200 bg-white p-6">
		<h3 class="mb-4 text-lg font-semibold">How it works</h3>
		<ul class="space-y-2 text-sm text-gray-600">
			<li>• Upload your GCash or Maya QR code image</li>
			<li>• The QR code will appear on all tenant payment receipts</li>
			<li>• Tenants scan the QR to send payment</li>
			<li>• You mark bills as paid manually after receiving payment</li>
		</ul>
	</div>
</div>
