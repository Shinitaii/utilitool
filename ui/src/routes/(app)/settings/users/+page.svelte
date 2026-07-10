<script lang="ts">
  import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
  import { auth } from '$lib/firebase';
  import { createUser } from '$lib/api/users';

  let email = $state('');
  let displayName = $state('');
  let password = $state('');
  let role = $state<'admin' | 'landlord' | 'assistant'>('assistant');
  let isLoading = $state(false);
  let error = $state('');
  let success = $state('');
  let warning = $state('');

  async function handleCreateUser(e: SubmitEvent) {
    e.preventDefault();
    isLoading = true;
    error = '';
    success = '';
    warning = '';

    if (password.length < 8) {
      error = 'Password must be at least 8 characters';
      isLoading = false;
      return;
    }

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(credential.user, { displayName });
      }

      // Pre-seed the user profile with the selected role
      try {
        await createUser({
          uid: credential.user.uid,
          role
        });
        success = `User "${displayName || email}" created successfully`;
      } catch (roleErr) {
        console.error('Failed to set user role:', roleErr);
        warning = `User "${displayName || email}" was created but role assignment failed. Retry setting the role from the users list.`;
      }

      email = '';
      displayName = '';
      password = '';
      role = 'assistant';
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      const messages: Record<string, string> = {
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/weak-password': 'Password is too weak. Use at least 8 characters.',
        'auth/invalid-email': 'Invalid email address.',
      };
      error = messages[code] ?? 'Failed to create user. Please try again.';
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

    {#if warning}
      <div class="mb-4 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
        {warning}
      </div>
    {/if}

    <form onsubmit={handleCreateUser} class="space-y-4 max-w-md">
      <div>
        <label for="email" class="block text-sm font-medium text-gray-700">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          required
          placeholder="user@example.com"
          class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-opacity-50 focus:outline-none focus:ring-2"
          style="--tw-ring-color: var(--color-accent)"
          disabled={isLoading}
        />
      </div>

      <div>
        <label for="displayName" class="block text-sm font-medium text-gray-700">Display Name</label>
        <input
          id="displayName"
          type="text"
          bind:value={displayName}
          placeholder="John Doe"
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
        <label for="role" class="block text-sm font-medium text-gray-700">Role</label>
        <select
          id="role"
          bind:value={role}
          class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-opacity-50 focus:outline-none focus:ring-2"
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
