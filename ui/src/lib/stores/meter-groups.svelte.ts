import { getMeterGroups } from '$lib/api/meter-groups';
import { createListStore } from '$lib/stores/list-store.svelte';

export const meterGroupsStore = createListStore(getMeterGroups);
