jest.mock('../billing-cycle/billing-cycle.repository');
jest.mock('../billing/billing.repository');
jest.mock('../meter-group/meter-group.repository');
jest.mock('../property/property.repository');
jest.mock('../reading/reading.repository');

import {describe, it, expect, jest, beforeEach} from '@jest/globals';
import {
  getSummary,
  getConsumption,
  getBillingTrends,
  getCollectionStatus,
  getAllReports,
} from './reports.service';
import {billingCycleRepository} from '../billing-cycle/billing-cycle.repository';
import {billingRepository} from '../billing/billing.repository';
import {meterGroupRepository} from '../meter-group/meter-group.repository';
import {propertyRepository} from '../property/property.repository';
import {readingRepository} from '../reading/reading.repository';

const toDate = (d: Date) => ({toDate: () => d} as any);

describe('getSummary - centavo-exact totals', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    (billingCycleRepository.search as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'cycle1',
          billing_rate: 10.125,
          billing_start_date: toDate(past),
          billing_end_date: toDate(future),
          overdue_date: toDate(future),
          billing_ids: {b1: 3, b2: 7},
        },
      ],
      hasMore: false,
      nextCursor: null,
    } as never);

    (billingRepository.getByIds as jest.Mock).mockResolvedValue([
      {
        id: 'b1',
        property_id: 'p1',
        previous_reading_id: 'r1-prev',
        current_reading_id: 'r1-curr',
        payment_status: 'pending',
      },
      {
        id: 'b2',
        property_id: 'p1',
        previous_reading_id: 'r2-prev',
        current_reading_id: 'r2-curr',
        payment_status: 'pending',
      },
    ] as never);

    (propertyRepository.getByIds as jest.Mock).mockResolvedValue([
      {
        id: 'p1',
        room_name: 'Room 1',
        meter_groups: {electricity: {meter_group_id: 'mg1', is_main_meter: true}},
      },
    ] as never);

    (meterGroupRepository.getByIds as jest.Mock).mockResolvedValue([
      {id: 'mg1', utility_type: 'electricity', versions: undefined},
    ] as never);

    (readingRepository.getByIds as jest.Mock).mockResolvedValue([
      {id: 'r1-prev', meter_group_id: 'mg1', reading_amount: 100, meter_version: 1},
      {id: 'r1-curr', meter_group_id: 'mg1', reading_amount: 103, meter_version: 1},
      {id: 'r2-prev', meter_group_id: 'mg1', reading_amount: 200, meter_version: 1},
      {id: 'r2-curr', meter_group_id: 'mg1', reading_amount: 207, meter_version: 1},
    ] as never);
  });

  it('sums per-billing amounts (rounded half-up to 2dp) to the exact centavo', async () => {
    // billing 1: consumption 3 * 10.125 = 30.375 -> 30.38
    // billing 2: consumption 7 * 10.125 = 70.875 -> 70.88
    // total: 101.26 (sum of already-rounded centavo amounts)
    const result = await getSummary('user1', {});

    expect(result.total_billed).toBe(101.26);
    expect(result.pending_amount).toBe(101.26);
    expect(result.overdue_amount).toBe(0);
    expect(result.total_revenue).toBe(0);
  });
});

describe('getAllReports - parity with the four granular endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    (billingCycleRepository.search as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'cycle1',
          billing_rate: 10.125,
          billing_start_date: toDate(past),
          billing_end_date: toDate(future),
          overdue_date: toDate(future),
          billing_ids: {b1: 3, b2: 7},
        },
      ],
      hasMore: false,
      nextCursor: null,
    } as never);

    (billingRepository.getByIds as jest.Mock).mockResolvedValue([
      {
        id: 'b1',
        property_id: 'p1',
        previous_reading_id: 'r1-prev',
        current_reading_id: 'r1-curr',
        payment_status: 'paid',
      },
      {
        id: 'b2',
        property_id: 'p1',
        previous_reading_id: 'r2-prev',
        current_reading_id: 'r2-curr',
        payment_status: 'pending',
      },
    ] as never);

    (propertyRepository.getByIds as jest.Mock).mockResolvedValue([
      {
        id: 'p1',
        room_name: 'Room 1',
        meter_groups: {electricity: {meter_group_id: 'mg1', is_main_meter: true}},
      },
    ] as never);

    (meterGroupRepository.getByIds as jest.Mock).mockResolvedValue([
      {id: 'mg1', utility_type: 'electricity', versions: undefined},
    ] as never);

    (readingRepository.getByIds as jest.Mock).mockResolvedValue([
      {id: 'r1-prev', meter_group_id: 'mg1', reading_amount: 100, meter_version: 1},
      {id: 'r1-curr', meter_group_id: 'mg1', reading_amount: 103, meter_version: 1},
      {id: 'r2-prev', meter_group_id: 'mg1', reading_amount: 200, meter_version: 1},
      {id: 'r2-curr', meter_group_id: 'mg1', reading_amount: 207, meter_version: 1},
    ] as never);
  });

  it('returns the same shapes as calling the four granular functions independently', async () => {
    const query = {};

    const [summary, consumption, billingTrends, collectionStatus] = await Promise.all([
      getSummary('user1', query),
      getConsumption('user1', query),
      getBillingTrends('user1', query),
      getCollectionStatus('user1', query),
    ]);

    const combined = await getAllReports('user1', query);

    expect(combined).toEqual({summary, consumption, billingTrends, collectionStatus});
  });
});
