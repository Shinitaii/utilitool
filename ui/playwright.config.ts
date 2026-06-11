import { defineConfig } from '@playwright/test';

// E2E config — see decisions/20260611_emulator-for-e2e-testing.md.
// Boots, in order: (1) Firestore + Auth emulators (project utilitool-test, api/firebase.json),
// (2) the API in dev:emulator mode against those emulators, (3) a `mode test` UI build/preview
// pointed at both via ui/.env.test.
export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.{ts,js}',
	timeout: 240_000,
	use: {
		baseURL: 'http://127.0.0.1:4173'
	},
	webServer: [
		{
			command: 'npx firebase emulators:start --project utilitool-test --only firestore,auth',
			cwd: '../api',
			port: 8080,
			reuseExistingServer: false,
			timeout: 120_000
		},
		{
			command: 'npm run dev:emulator',
			cwd: '../api/functions',
			port: 5002,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000
		},
		{
			command: 'npm run build -- --mode test && npm run preview -- --mode test --host 127.0.0.1',
			port: 4173,
			reuseExistingServer: false,
			timeout: 120_000
		}
	]
});
