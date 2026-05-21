import { redirect } from '@sveltejs/kit';
import { getAccessToken } from '$lib/api/client';
import { browser } from '$app/environment';

export const ssr = false;

export async function load() {
  if (browser) {
    const token = await getAccessToken();
    if (!token) {
      redirect(307, '/login');
    }
  }
}
