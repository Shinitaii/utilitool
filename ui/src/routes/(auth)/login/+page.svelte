<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { signInWithEmailAndPassword } from 'firebase/auth';
	import { auth } from '$lib/firebase';

	let email = $state('');
	let password = $state('');
	let isLoading = $state(false);
	let error = $state('');
	async function handleLogin(e: SubmitEvent) {
		e.preventDefault();
		isLoading = true;
		error = '';

		try {
			await signInWithEmailAndPassword(auth, email, password);
			await goto(resolve('/dashboard'));
		} catch (err: unknown) {
			const code = (err as { code?: string })?.code ?? '';
			const firebaseMessages: Record<string, string> = {
				'auth/invalid-credential': 'Invalid email or password',
				'auth/wrong-password': 'Invalid email or password',
				'auth/user-not-found': 'Invalid email or password',
				'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
				'auth/user-disabled': 'This account has been disabled. Contact support.',
				'auth/network-request-failed': 'Network error. Check your connection and try again.'
			};
			error = firebaseMessages[code] ?? 'Login failed. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	function handleGoogleOAuth() {
		error = 'Google OAuth is not yet implemented';
	}
</script>

<div class="rounded-lg bg-white p-8 shadow-lg">
	<div class="mb-8 text-center">
		<h1 class="text-3xl font-bold" style="color: var(--color-accent)">utilitool</h1>
		<p class="mt-2 text-sm tracking-widest text-gray-600 uppercase">
			utility billing · for landlords
		</p>
	</div>

	{#if error}
		<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
			{error}
		</div>
	{/if}

	<form onsubmit={handleLogin} class="space-y-4">
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

		<div>
			<label for="password" class="block text-sm font-medium text-gray-700">Password</label>
			<input
				id="password"
				type="password"
				bind:value={password}
				required
				placeholder="••••••••"
				minlength="8"
				class="focus:border-opacity-50 mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:ring-2 focus:outline-none"
				style="--tw-ring-color: var(--color-accent)"
				disabled={isLoading}
			/>
		</div>

		<div class="flex justify-end">
			<a
				href={resolve('/forgot-password')}
				class="text-sm hover:text-gray-900"
				style="color: var(--color-accent)"
			>
				Forgot password?
			</a>
		</div>

		<button
			type="submit"
			disabled={isLoading}
			class="w-full rounded px-4 py-2 font-medium text-white transition-opacity disabled:opacity-50"
			style="background-color: var(--color-accent)"
		>
			{isLoading ? 'Logging in...' : 'Log in →'}
		</button>
	</form>

	<div class="relative my-6">
		<div class="absolute inset-0 flex items-center">
			<div class="w-full border-t border-gray-300"></div>
		</div>
		<div class="relative flex justify-center text-sm">
			<span class="bg-white px-2 text-gray-600">or</span>
		</div>
	</div>

	<button
		type="button"
		onclick={handleGoogleOAuth}
		class="w-full rounded border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50"
	>
		Continue with Google
	</button>
</div>

<style>
	:global(body) {
		background-color: var(--color-paper);
	}
</style>
