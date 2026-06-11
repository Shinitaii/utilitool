import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-vercel';
import { loadEnv } from 'vite';

// E2E tests only (decisions/20260611_emulator-for-e2e-testing.md): `vite build --mode test`
// loads ui/.env.test for `import.meta.env`, but this config file runs in plain Node and reads
// `process.env` directly — load the same file here so the CSP can react to it.
const mode = process.argv.includes('--mode')
	? process.argv[process.argv.indexOf('--mode') + 1]
	: 'production';
Object.assign(process.env, loadEnv(mode, process.cwd(), 'VITE_'));

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		csp: {
			directives: {
				'default-src': ["'self'"],
				'script-src': ["'self'", "'nonce-{nonce}'"],
				'style-src': ["'self'", "'unsafe-inline'"],
				'img-src': ["'self'", 'data:', 'blob:', 'firebasestorage.googleapis.com'],
				'connect-src': [
					"'self'",
					process.env.VITE_API_BASE_URL ?? 'http://localhost:5002',
					'https://*.googleapis.com',
					'https://*.firebaseio.com',
					'https://identitytoolkit.googleapis.com',
					'https://securetoken.googleapis.com',
					// E2E tests only (decisions/20260611_emulator-for-e2e-testing.md): allow the
					// SDK to reach the local Firebase Auth/Storage emulators.
					...(process.env.VITE_USE_FIREBASE_EMULATOR === 'true'
						? ['http://127.0.0.1:9099', 'http://127.0.0.1:9199']
						: [])
				],
				'font-src': ["'self'"],
				'object-src': ["'none'"],
				'base-uri': ["'self'"],
				'frame-ancestors': ["'none'"]
			}
		}
	},
	preprocess: [mdsvex({ extensions: ['.svx', '.md'] })],
	extensions: ['.svelte', '.svx', '.md']
};

export default config;
