import { getMeterGroups } from '$lib/api/meter-groups';
import { getProperties } from '$lib/api/properties';
import { getTenants } from '$lib/api/tenants';
import { getReadings } from '$lib/api/readings';
import { getBillings } from '$lib/api/billings';

interface NavCounts {
	meterGroups: number | null;
	properties: number | null;
	tenants: number | null;
	readings: number | null;
	billings: number | null;
}

let counts = $state<NavCounts>({
	meterGroups: null,
	properties: null,
	tenants: null,
	readings: null,
	billings: null
});

let loaded = false;

export const navCounts = {
	get meterGroups() {
		return counts.meterGroups;
	},
	get properties() {
		return counts.properties;
	},
	get tenants() {
		return counts.tenants;
	},
	get readings() {
		return counts.readings;
	},
	get billings() {
		return counts.billings;
	}
};

export async function loadNavCounts() {
	if (loaded) return;
	loaded = true;
	const [meterGroups, properties, tenants, readings, billings] = await Promise.all([
		getMeterGroups({ limit: 100 }).catch(() => null),
		getProperties({ limit: 100 }).catch(() => null),
		getTenants({ limit: 100 }).catch(() => null),
		getReadings({ limit: 100 }).catch(() => null),
		getBillings({ limit: 100 }).catch(() => null)
	]);
	counts = {
		meterGroups: meterGroups?.data.length ?? null,
		properties: properties?.data.length ?? null,
		tenants: tenants?.data.length ?? null,
		readings: readings?.data.length ?? null,
		billings: billings?.data.length ?? null
	};
}
