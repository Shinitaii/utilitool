// Runs once before the E2E suite. Seeds a Firebase Auth Emulator test user and, by default,
// clears any leftover Firestore emulator data so the happy-path spec starts from a clean
// slate. See decisions/20260611_emulator-for-e2e-testing.md.
//
// Set SEED_FROM_STAGING=true to instead import a real-shaped snapshot of staging data (via
// api/functions/src/migrations/copy-staging-to-emulator.ts) before the suite runs, instead of
// clearing to an empty DB — lets the suite exercise real data shapes/scale rather than only
// the synthetic fixtures the happy-path spec creates. Run the copy script yourself first
// (dry run, then EXECUTE=true) against the SAME emulator this suite will boot; this flag only
// skips the destructive clear step so that data survives into the test run.

const PROJECT_ID = 'utilitool-test';
export const E2E_EMAIL = 'e2e@utilitool.test';
export const E2E_PASSWORD = 'e2e-test-password-123';

async function waitForEmulators(): Promise<void> {
	const deadline = Date.now() + 180_000;
	let lastErr: unknown;
	while (Date.now() < deadline) {
		try {
			await fetch('http://127.0.0.1:8080/');
			await fetch('http://127.0.0.1:9099/');
			return;
		} catch (err) {
			lastErr = err;
			await new Promise((r) => setTimeout(r, 1000));
		}
	}
	throw new Error(`Emulators did not become ready in time: ${lastErr}`);
}

async function clearFirestore(): Promise<void> {
	const url = `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
	const res = await fetch(url, { method: 'DELETE' });
	if (!res.ok && res.status !== 404) {
		throw new Error(`Failed to clear Firestore emulator data: ${res.status} ${await res.text()}`);
	}
}

export async function ensureTestUser(): Promise<void> {
	const url = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`;
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD, returnSecureToken: true })
	});

	if (res.ok) return;

	const body = await res.json();
	// Auth emulator state persists across runs if --export-on-exit/--import is configured;
	// treat "already exists" as success.
	if (body?.error?.message === 'EMAIL_EXISTS') return;

	throw new Error(`Failed to create E2E test user: ${res.status} ${JSON.stringify(body)}`);
}

export async function setupEmulatorState(): Promise<void> {
	await waitForEmulators();

	if (process.env.SEED_FROM_STAGING === 'true') {
		// Caller is responsible for having already run
		// api/functions/src/migrations/copy-staging-to-emulator.ts (EXECUTE=true) against this
		// same emulator instance — skip the destructive clear so that data survives.
		console.log(
			'SEED_FROM_STAGING=true: skipping Firestore clear, keeping imported staging snapshot.'
		);
	} else {
		await clearFirestore();
	}

	await ensureTestUser();
}
