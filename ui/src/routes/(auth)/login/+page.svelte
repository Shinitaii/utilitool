<script lang="ts">
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.svelte';
  import { setTokens } from '$lib/api/client';
  import { login } from '$lib/api/auth';
  import type { AuthResponse } from '$lib/types/auth.types';

  let email = $state('');
  let password = $state('');
  let isLoading = $state(false);
  let error = $state('');
  let rememberMe = $state(false);

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault();
    isLoading = true;
    error = '';

    try {
      const response: AuthResponse = await login(email, password);
      setTokens(response.access_token, response.refresh_token);
      authStore.login({ userId: '', email });
      await goto('/dashboard');
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Login failed. Please try again.';
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
    <p class="mt-2 text-sm uppercase tracking-widest text-gray-600">
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
    </div>

    <div class="flex items-center justify-between">
      <label class="flex items-center">
        <input type="checkbox" bind:checked={rememberMe} class="rounded border-gray-300" />
        <span class="ml-2 text-sm text-gray-600">Remember me</span>
      </label>
      <a href="/forgot-password" class="text-sm hover:text-gray-900" style="color: var(--color-accent)">
        Forgot?
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

  <p class="mt-6 text-center text-sm text-gray-600">
    No account?
    <a href="/register" class="font-medium hover:underline" style="color: var(--color-accent)">
      Sign up →
    </a>
  </p>
</div>

<style>
  :global(body) {
    background-color: var(--color-paper);
  }
</style>
