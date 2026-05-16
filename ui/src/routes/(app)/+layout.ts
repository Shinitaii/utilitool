import { redirect } from '@sveltejs/kit';
import { getAccessToken } from '$lib/api/client';

export function load() {
  const token = getAccessToken();
  if (!token) {
    redirect(307, '/login');
  }
}
