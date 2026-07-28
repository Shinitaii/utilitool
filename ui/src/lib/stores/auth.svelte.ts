import { writable } from 'svelte/store';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '$lib/firebase';
import { getMe } from '$lib/api/auth';
import type { AuthUser } from '$lib/types/auth.types';
import type { ApiError } from '$lib/types/api.types';

const ME_RETRY_DELAYS_MS = [500, 1500, 3000];

function isAuthApiError(error: unknown): error is ApiError {
	return typeof error === 'object' && error !== null && 'status' in error;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getMeWithRetry(): Promise<AuthUser> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await getMe();
		} catch (error) {
			const isRealAuthFailure =
				isAuthApiError(error) && (error.status === 401 || error.status === 403);
			if (isRealAuthFailure || attempt >= ME_RETRY_DELAYS_MS.length) {
				throw error;
			}
			await sleep(ME_RETRY_DELAYS_MS[attempt]);
		}
	}
}

export interface AuthState {
	isAuthenticated: boolean;
	user: AuthUser | null;
	isLoading: boolean;
	error: string | null;
}

function createAuthStore() {
	const { subscribe, update } = writable<AuthState>({
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

export function initAuthListener(): () => void {
	authStore.setLoading(true);
	const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
		if (firebaseUser) {
			try {
				const user = await getMeWithRetry();
				authStore.login(user);
			} catch (error) {
				const message = isAuthApiError(error) ? error.message : 'Failed to load your profile';
				authStore.logout();
				authStore.setError(message);
			}
		} else {
			authStore.logout();
		}
		authStore.setLoading(false);
	});
	return unsubscribe;
}
