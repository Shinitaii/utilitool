<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';
  import { setTokens } from '$lib/api/client';
  import { register } from '$lib/api/auth';
  import type { AuthResponse } from '$lib/types/auth.types';

  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let isLoading = $state(false);
  let error = $state('');

  async function handleRegister(e: SubmitEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }

    if (password.length < 8) {
      error = 'Password must be at least 8 characters';
      return;
    }

    isLoading = true;
    error = '';

    try {
      const response: AuthResponse = await register(email, password);
      setTokens(response.access_token, response.refresh_token);
      authStore.login({ userId: '', email });
      await goto('/dashboard');
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Registration failed. Please try again.';
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="rounded-lg bg-white p-8 shadow-lg">
  <div class="mb-8 text-center">
    <h1 class="text-3xl font-bold" style="color: var(--color-accent)">utilitool</h1>
    <p class="mt-2 text-sm uppercase tracking-widest text-gray-600">
      create your account
    </p>
  </div>

  {#if error}
    <div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
      {error}
    </div>
  {/if}

  <form onsubmit={handleRegister} class="space-y-4">
    <div>
      <label for="email" class="block text-sm font-medium text-gray-700">Email</label>
      <input
        id="email"
        type="email"
        bind:value={email}
        required
        placeholder="your@email.com"
        class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-opacity-50 focus:outline-none focus:ring-2"
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
        class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-opacity-50 focus:outline-none focus:ring-2"
        style="--tw-ring-color: var(--color-accent)"
        disabled={isLoading}
      />
      <p class="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
    </div>

    <div>
      <label for="confirmPassword" class="block text-sm font-medium text-gray-700">
        Confirm Password
      </label>
      <input
        id="confirmPassword"
        type="password"
        bind:value={confirmPassword}
        required
        placeholder="••••••••"
        minlength="8"
        class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-opacity-50 focus:outline-none focus:ring-2"
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
      {isLoading ? 'Creating account...' : 'Sign up →'}
    </button>
  </form>

  <p class="mt-6 text-center text-sm text-gray-600">
    Already have an account?
    <a href="/login" class="font-medium hover:underline" style="color: var(--color-accent)">
      Log in →
    </a>
  </p>
</div>

<style>
  :global(body) {
    background-color: var(--color-paper);
  }
</style>
