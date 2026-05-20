jest.mock('../billing/billing.repository');
jest.mock('../reading/reading.repository');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BillingCycleValidator } from './billing-cycle.validator';
import { billingRepository } from '../billing/billing.repository';
import { readingRepository } from '../reading/reading.repository';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

const startTs = new Timestamp(Math.floor(Date.now() / 1000) - 86400 * 30, 0);
const endTs = new Timestamp(Math.floor(Date.now() / 1000) - 86400, 0);

const mockBilling = (id: string) => ({
  id,
  property_id: 'prop-1',
  previous_reading_id: 'r-1',
  current_reading_id: 'r-2',
  payment_status: 'pending' as const,
  is_deleted: false,
  deleted_at: null,
  created_at: Timestamp.now(),
});

describe('BillingCycleValidator', () => {
  let validator: BillingCycleValidator;

  beforeEach(() => {
    validator = new BillingCycleValidator();
    jest.clearAllMocks();
    jest.mocked(billingRepository.getById).mockImplementation(async (id: string) => mockBilling(id));
    // Return null so per-billing consumption validation is skipped (readings not loaded in these unit tests)
    jest.mocked(readingRepository.getById).mockResolvedValue(null);
  });

  describe('validateConsumptionTolerance (via validateCreate)', () => {
    const base = {
      billing_ids: { 'b-1': 100 },
      billing_rate: 5,
      billing_start_date: startTs,
      billing_end_date: endTs,
    };

    it('should pass when calculated consumption exactly equals expected', async () => {
      await expect(validator.validateCreate({ ...base, billing_consumption: 100 })).resolves.toBeUndefined();
    });

    it('should pass when calculated consumption is exactly at 3% tolerance (under)', async () => {
      // calculated=100, expected=103 → diff=3, tolerance=3.09 → should pass
      await expect(validator.validateCreate({ ...base, billing_consumption: 103 })).resolves.toBeUndefined();
    });

    it('should pass when calculated consumption is exactly at 3% tolerance (over)', async () => {
      // calculated=100, expected=97.09 → diff=2.91, tolerance=2.91 → passes
      await expect(validator.validateCreate({ ...base, billing_consumption: 97.09 })).resolves.toBeUndefined();
    });

    it('should fail when calculated consumption exceeds 3% tolerance', async () => {
      // calculated=100, expected=200 → diff=100, tolerance=6 → must fail
      await expect(validator.validateCreate({ ...base, billing_consumption: 200 })).rejects.toBeInstanceOf(AppError);
    });

    it('should fail when billing_ids is empty', async () => {
      await expect(
        validator.validateCreate({ ...base, billing_ids: {}, billing_consumption: 0 })
      ).rejects.toBeInstanceOf(AppError);
    });

    it('should fail when billing_consumption is negative', async () => {
      await expect(
        validator.validateCreate({ ...base, billing_consumption: -1 })
      ).rejects.toBeInstanceOf(AppError);
    });

    it('should fail when billing_rate is negative', async () => {
      await expect(
        validator.validateCreate({ ...base, billing_rate: -1, billing_consumption: 100 })
      ).rejects.toBeInstanceOf(AppError);
    });

    it('should fail when start date is after end date', async () => {
      await expect(
        validator.validateCreate({ ...base, billing_start_date: endTs, billing_end_date: startTs, billing_consumption: 100 })
      ).rejects.toBeInstanceOf(AppError);
    });

    it('should fail when a billing ID does not exist', async () => {
      jest.mocked(billingRepository.getById).mockResolvedValue(null);
      await expect(
        validator.validateCreate({ ...base, billing_consumption: 100 })
      ).rejects.toBeInstanceOf(AppError);
    });

    it('should pass with multiple billing IDs whose sum matches consumption', async () => {
      const multiIds = { 'b-1': 60, 'b-2': 40 };
      await expect(
        validator.validateCreate({ ...base, billing_ids: multiIds, billing_consumption: 100 })
      ).resolves.toBeUndefined();
    });
  });
});
