<script lang="ts">
	import { sendPasswordResetEmail } from 'firebase/auth';
	import { resolve } from '$app/paths';
	import { auth } from '$lib/firebase';

	let email = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let sent = $state(false);

	async function handleReset(e: SubmitEvent) {
		e.preventDefault();
		isLoading = true;
		error = '';

		try {
			await sendPasswordResetEmail(auth, email);
			sent = true;
		} catch (err: unknown) {
			const code = (err as { code?: string })?.code ?? '';
			const firebaseMessages: Record<string, string> = {
				'auth/invalid-email': 'Please enter a valid email address.',
				'auth/user-not-found': 'No account found with that email.',
				'auth/too-many-requests': 'Too many attempts. Please try again later.',
				'auth/network-request-failed': 'Network error. Check your connection and try again.'
			};
			error = firebaseMessages[code] ?? 'Could not send reset email. Please try again.';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="rounded-lg bg-white p-8 shadow-lg">
	<div class="mb-8 text-center">
		<h1 class="text-3xl font-bold" style="color: var(--color-accent)">utilitool</h1>
		<p class="mt-2 text-sm tracking-widest text-gray-600 uppercase">reset your password</p>
	</div>

	{#if sent}
		<div class="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-700">
			If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check
			your inbox.
		</div>
		<a
			href={resolve('/login')}
			class="block w-full rounded px-4 py-2 text-center font-medium text-white"
			style="background-color: var(--color-accent)"
		>
			Back to login
		</a>
	{:else}
		{#if error}
			<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
		{/if}

		<form onsubmit={handleReset} class="space-y-4">
			<div>
				<label for="email" class="block text-sm font-medium text-gray-700">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					required
					placeholder="rico@buildings.ph"
					class="focus:border-opacity-50 mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:ring-2 focus:outline-none"
					style="--tw-ring-color: var(--color-accent)"
					disabled={isLoading}
				/>
			</div>

			<button
				type="submit"
				disabled={isLoading}
				class="w-full rounded px-4 py-2 font-medium text-white transition-opacity disabled:opacity-50"
				style="background-color: var(--color-accent)"
			>
				{isLoading ? 'Sending...' : 'Send reset link →'}
			</button>
		</form>

		<div class="mt-6 text-center text-sm">
			<a href={resolve('/login')} class="hover:text-gray-900" style="color: var(--color-accent)">
				Back to login
			</a>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		background-color: var(--color-paper);
	}
</style>
