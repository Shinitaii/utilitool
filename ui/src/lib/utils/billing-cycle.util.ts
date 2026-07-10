import type { BillingCycle } from '$lib/types/billing-cycle.types';
import type { Billing } from '$lib/types/billing.types';

export function getCyclePaidAmount(cycle: BillingCycle, billings: Map<string, Billing>): number {
	let total = 0;
	for (const [billingId, consumption] of Object.entries(cycle.billing_ids)) {
		const billing = billings.get(billingId);
		if (billing?.payment_status === 'paid') {
			total += consumption * cycle.billing_rate;
		}
	}
	return total;
}

export function getCycleOutstandingAmount(
	cycle: BillingCycle,
	billings: Map<string, Billing>
): number {
	let total = 0;
	for (const [billingId, consumption] of Object.entries(cycle.billing_ids)) {
		const billing = billings.get(billingId);
		if (billing?.payment_status !== 'paid') {
			total += consumption * cycle.billing_rate;
		}
	}
	return total;
}
