<script lang="ts">
  import { signInWithEmailAndPassword } from 'firebase/auth';
  import { auth } from '../firebase';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleLogin(e: Event) {
    e.preventDefault();
    loading = true;
    error = '';
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.hash = '#/home';
    } catch (err: any) {
      error = err.message || 'Login failed';
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center p-4" style="background-color: var(--color-bg-primary)">
  <div class="w-full max-w-md">
    <div class="bg-white rounded-lg shadow-sm p-6" style="border: 1px solid var(--color-border)">
      <!-- Logo / Title -->
      <h1 class="text-3xl font-bold text-center mb-2" style="color: var(--color-accent)">Utilitool</h1>
      <p class="text-center text-sm mb-8" style="color: var(--color-text-secondary)">Meter Reader</p>

      <!-- Form -->
      <form onsubmit={handleLogin} class="space-y-4">
        <!-- Email Field -->
        <div>
          <label for="email" class="label-base">Email</label>
          <input
            id="email"
            type="email"
            bind:value={email}
            disabled={loading}
            required
            class="input-base w-full"
            placeholder="meter.reader@example.com"
          />
        </div>

        <!-- Password Field -->
        <div>
          <label for="password" class="label-base">Password</label>
          <input
            id="password"
            type="password"
            bind:value={password}
            disabled={loading}
            required
            class="input-base w-full"
            placeholder="••••••••"
          />
        </div>

        <!-- Error Message -->
        {#if error}
          <div class="p-3 rounded-lg text-sm font-medium" style="background-color: #fde5e0; color: var(--color-status-alert)">
            {error}
          </div>
        {/if}

        <!-- Submit Button -->
        <button
          type="submit"
          disabled={loading}
          class="btn-primary w-full text-base"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>

    <!-- Footer -->
    <p class="text-center text-xs mt-6" style="color: var(--color-text-tertiary)">
      Secure meter reading application
    </p>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }
</style>
