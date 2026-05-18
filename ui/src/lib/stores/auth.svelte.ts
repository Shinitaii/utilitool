import { writable } from 'svelte/store';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '$lib/firebase';
import { getMe } from '$lib/api/auth';
import type { AuthUser } from '$lib/types/auth.types';

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: false,
    error: null
  });

  return {
    subscribe,
    setLoading: (loading: boolean) => update((state) => ({ ...state, isLoading: loading })),
    setError: (error: string | null) => update((state) => ({ ...state, error })),
    setUser: (user: AuthUser | null) =>
      update((state) => ({ ...state, user, isAuthenticated: !!user })),
    login: (user: AuthUser) =>
      update((state) => ({ ...state, user, isAuthenticated: true, error: null })),
    logout: () =>
      update((state) => ({ ...state, user: null, isAuthenticated: false, error: null })),
    clearError: () => update((state) => ({ ...state, error: null }))
  };
}

export const authStore = createAuthStore();

export function initAuthListener() {
  authStore.setLoading(true);
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      try {
        const user = await getMe();
        authStore.login(user);
      } catch {
        authStore.logout();
      }
    } else {
      authStore.logout();
    }
    authStore.setLoading(false);
  });
}
