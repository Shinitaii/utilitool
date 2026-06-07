import type { BillingCycle } from '../api/billing-cycles';
import type { Billing } from '../api/billings';

export interface StatusSummary {
  overdue: number;
  pending: number;
  paid: number;
}

export function getStatusSummary(cycle: BillingCycle, billings: Map<string, Billing>): StatusSummary {
  const summary: StatusSummary = {
    overdue: 0,
    pending: 0,
    paid: 0,
  };

  for (const billingId of Object.keys(cycle.billing_ids)) {
    const billing = billings.get(billingId);
    if (!billing) continue;

    if (billing.payment_status === 'paid') {
      summary.paid += 1;
    } else if (billing.payment_status === 'overdue') {
      summary.overdue += 1;
    } else {
      summary.pending += 1;
    }
  }

  return summary;
}

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

export function getCycleOutstandingAmount(cycle: BillingCycle, billings: Map<string, Billing>): number {
  let total = 0;
  for (const [billingId, consumption] of Object.entries(cycle.billing_ids)) {
    const billing = billings.get(billingId);
    if (billing?.payment_status !== 'paid') {
      total += consumption * cycle.billing_rate;
    }
  }
  return total;
}
