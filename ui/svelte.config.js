import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-vercel';

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
					'https://securetoken.googleapis.com'
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
