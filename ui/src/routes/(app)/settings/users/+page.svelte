<script lang="ts">
	import { createUser } from '$lib/api/users';
	import type { ApiError } from '$lib/types/api.types';

	let email = $state('');
	let displayName = $state('');
	let password = $state('');
	let role = $state<'admin' | 'landlord' | 'assistant'>('assistant');
	let isLoading = $state(false);
	let error = $state('');
	let success = $state('');

	async function handleCreateUser(e: SubmitEvent) {
		e.preventDefault();
		isLoading = true;
		error = '';
		success = '';

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			isLoading = false;
			return;
		}

		try {
			// Account creation happens entirely server-side (Firebase Admin SDK via
			// POST /users) — the client never touches Firebase Auth for this flow, so
			// the acting admin's own session is never affected by the new account.
			await createUser({ email, password, displayName: displayName || undefined, role });
			success = `User "${displayName || email}" created successfully`;

			email = '';
			displayName = '';
			password = '';
			role = 'assistant';
		} catch (err: unknown) {
			error = (err as ApiError)?.message ?? 'Failed to create user. Please try again.';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold">Settings</h1>
		<p class="text-gray-600">Manage users and system settings</p>
	</div>

	<div class="rounded-lg border border-gray-200 bg-white p-6">
		<h2 class="mb-6 text-xl font-semibold">Create New User</h2>

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

		<form onsubmit={handleCreateUser} class="max-w-md space-y-4">
			<div>
				<label for="email" class="block text-sm font-medium text-gray-700">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					required
					placeholder="user@example.com"
					class="focus:border-opacity-50 mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:ring-2 focus:outline-none"
					style="--tw-ring-color: var(--color-accent)"
					disabled={isLoading}
				/>
			</div>

			<div>
				<label for="displayName" class="block text-sm font-medium text-gray-700">Display Name</label
				>
				<input
					id="displayName"
					type="text"
					bind:value={displayName}
					placeholder="John Doe"
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
				<p class="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
			</div>

			<div>
				<label for="role" class="block text-sm font-medium text-gray-700">Role</label>
				<select
					id="role"
					bind:value={role}
					class="focus:border-opacity-50 mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:ring-2 focus:outline-none"
					style="--tw-ring-color: var(--color-accent)"
					disabled={isLoading}
				>
					<option value="assistant">Assistant (Meter Reader)</option>
					<option value="landlord">Landlord</option>
					<option value="admin">Admin</option>
				</select>
			</div>

			<button
				type="submit"
				disabled={isLoading}
				class="w-full rounded px-4 py-2 font-medium text-white transition-opacity disabled:opacity-50"
				style="background-color: var(--color-accent)"
			>
				{isLoading ? 'Creating user...' : 'Create User'}
			</button>
		</form>
	</div>
</div>
