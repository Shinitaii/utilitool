import { getProperties } from '$lib/api/properties';
import { createListStore } from '$lib/stores/list-store.svelte';

export const propertiesStore = createListStore(getProperties);
