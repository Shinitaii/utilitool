import type { BillingCycle } from '$lib/types/billing-cycle.types';
import type { Billing } from '$lib/types/billing.types';
import { billAmount, sumMoney } from './money';

export function getCyclePaidAmount(cycle: BillingCycle, billings: Map<string, Billing>): number {
	const amounts: number[] = [];
	for (const [billingId, consumption] of Object.entries(cycle.billing_ids)) {
		const billing = billings.get(billingId);
		if (billing?.payment_status === 'paid') {
			amounts.push(billAmount(consumption, cycle.billing_rate));
		}
	}
	return sumMoney(amounts);
}

export function getCycleOutstandingAmount(
	cycle: BillingCycle,
	billings: Map<string, Billing>
): number {
	const amounts: number[] = [];
	for (const [billingId, consumption] of Object.entries(cycle.billing_ids)) {
		const billing = billings.get(billingId);
		if (billing?.payment_status !== 'paid') {
			amounts.push(billAmount(consumption, cycle.billing_rate));
		}
	}
	return sumMoney(amounts);
}
