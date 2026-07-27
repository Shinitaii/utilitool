jest.mock('./billing.repository');
jest.mock('../reading/reading.repository');

import {describe, it, expect, jest, beforeEach} from '@jest/globals';
import {computeEstimatedCost, billingService} from './billing.service';
import {billingRepository} from './billing.repository';
import {readingRepository} from '../reading/reading.repository';

describe('computeEstimatedCost', () => {
  it('multiplies raw consumption by the rate EMA when versions match', () => {
    expect(computeEstimatedCost(150, 100, 1, 1, 12.5)).toBeCloseTo(50 * 12.5);
  });

  it('returns null when there is no prior cycle yet (cold start)', () => {
    expect(computeEstimatedCost(150, 100, 1, 1, null)).toBeNull();
  });

  it('returns null across a meter-version reset, even with a valid rate EMA', () => {
    expect(computeEstimatedCost(20, 950, 2, 1, 12.5)).toBeNull();
  });
});

describe('billingService.recomputePendingEstimates', () => {
  const TEST_USER_ID = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('no-ops without querying billings when latestRateEma is null', async () => {
    await billingService.recomputePendingEstimates(TEST_USER_ID, 'mg-1', null, new Set());

    expect(billingRepository.search).not.toHaveBeenCalled();
  });

  it('skips billings already referenced by a cycle (cycledBillingIds)', async () => {
    jest.mocked(billingRepository.search).mockResolvedValue({
      data: [{
        id: 'billing-cycled',
        property_id: 'prop-1',
        previous_reading_id: 'r-prev',
        current_reading_id: 'r-curr',
        meter_group_id: 'mg-1',
        payment_status: 'pending',
        estimated_cost: 999,
        created_at: new Date() as any,
        updated_at: new Date() as any,
        is_deleted: false,
        deleted_at: null,
      }],
      hasMore: false,
      nextCursor: null,
    });

    await billingService.recomputePendingEstimates(
      TEST_USER_ID,
      'mg-1',
      20,
      new Set(['billing-cycled'])
    );

    expect(readingRepository.getByIds).not.toHaveBeenCalled();
    expect(billingRepository.updateBatch).not.toHaveBeenCalled();
  });

  it('only writes pending billings whose recomputed estimate actually changed', async () => {
    jest.mocked(billingRepository.search).mockResolvedValue({
      data: [
        {
          id: 'billing-stale',
          property_id: 'prop-1',
          previous_reading_id: 'r-prev-1',
          current_reading_id: 'r-curr-1',
          meter_group_id: 'mg-1',
          payment_status: 'pending',
          estimated_cost: 500,
          created_at: new Date() as any,
          updated_at: new Date() as any,
          is_deleted: false,
          deleted_at: null,
        },
        {
          id: 'billing-already-current',
          property_id: 'prop-2',
          previous_reading_id: 'r-prev-2',
          current_reading_id: 'r-curr-2',
          meter_group_id: 'mg-1',
          payment_status: 'pending',
          estimated_cost: (80 - 30) * 20, // already matches what the new rate_ema would produce
          created_at: new Date() as any,
          updated_at: new Date() as any,
          is_deleted: false,
          deleted_at: null,
        },
      ],
      hasMore: false,
      nextCursor: null,
    });
    jest.mocked(readingRepository.getByIds).mockResolvedValue([
      {id: 'r-prev-1', reading_amount: 100, meter_version: 1} as any,
      {id: 'r-curr-1', reading_amount: 150, meter_version: 1} as any,
      {id: 'r-prev-2', reading_amount: 30, meter_version: 1} as any,
      {id: 'r-curr-2', reading_amount: 80, meter_version: 1} as any,
    ]);
    jest.mocked(billingRepository.updateBatch).mockResolvedValue([]);

    await billingService.recomputePendingEstimates(TEST_USER_ID, 'mg-1', 20, new Set());

    expect(billingRepository.updateBatch).toHaveBeenCalledWith([
      {id: 'billing-stale', data: {estimated_cost: (150 - 100) * 20}},
    ]);
  });
});
