import { getTenants } from '$lib/api/tenants';
import { createListStore } from '$lib/stores/list-store.svelte';

export const tenantsStore = createListStore(getTenants);
