import { clearCache as clearPropertiesCache } from './properties';
import { clearCache as clearMeterGroupsCache } from './meter-groups';
import { clearCache as clearTenantsCache } from './tenants';
import { clearCache as clearReadingsCache } from './readings';
import { clearCache as clearBillingsCache } from './billings';
import { clearCache as clearBillingCyclesCache } from './billing-cycles';

export async function clearAllCaches(): Promise<void> {
	await Promise.all([
		clearPropertiesCache(),
		clearMeterGroupsCache(),
		clearTenantsCache(),
		clearReadingsCache(),
		clearBillingsCache(),
		clearBillingCyclesCache()
	]);
}
