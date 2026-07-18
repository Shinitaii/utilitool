jest.mock('../billing/billing.repository');
jest.mock('../reading/reading.repository');
jest.mock('../meter-group/meter-group.repository');
jest.mock('../property/property.repository');
jest.mock('./billing-cycle.repository');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BillingCycleValidator } from './billing-cycle.validator';
import { CreateBillingCycleDTOSchema } from './billing-cycle.dto';
import { billingRepository } from '../billing/billing.repository';
import { readingRepository } from '../reading/reading.repository';
import { meterGroupRepository } from '../meter-group/meter-group.repository';
import { propertyRepository } from '../property/property.repository';
import { billingCycleRepository } from './billing-cycle.repository';
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
    // validateBillingConsumptionAmounts batch-fetches via getByIds, not getById
    jest.mocked(billingRepository.getByIds).mockImplementation(async (ids: string[]) => ids.map((id) => mockBilling(id)));
    // Return null so per-billing consumption validation is skipped (readings not loaded in these unit tests)
    jest.mocked(readingRepository.getById).mockResolvedValue(null);
    jest.mocked(readingRepository.getByIds).mockResolvedValue([]);
    jest.mocked(propertyRepository.getByIds).mockResolvedValue([]);
    jest.mocked(meterGroupRepository.getByIds).mockResolvedValue([]);
    jest.mocked(billingCycleRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null });
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

    it('should reject create when meter_group_id is missing', async () => {
      const result = CreateBillingCycleDTOSchema.safeParse({
        billing_ids: { 'b-1': 100 },
        billing_rate: 10,
        billing_consumption: 100,
        billing_start_date: Timestamp.fromDate(new Date('2026-04-01')),
        billing_end_date: Timestamp.fromDate(new Date('2026-04-30')),
        // meter_group_id intentionally omitted
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validateSubmeterConsumption - meter-reset boundary', () => {
    // Reproduces the reported bug: a submeter that went through a meter
    // reset (previous true total 634, reset to v2, current raw reading 5.5 —
    // true consumption should be 5.5) must be validated against its TRUE,
    // version-aware delta. If a bad/overstated consumption number for that
    // submeter slips through, billingCycleService used to only discover the
    // mismatch AFTER already trying to derive+create a main-meter reading
    // from the bad total, surfacing a confusing "meter rollback" error
    // instead of this validator's clear "deviates more than 5%" message.
    const prevReading = {
      id: 'r-1',
      meter_group_id: 'mg-1',
      property_id: 'prop-1',
      reading_amount: 634,
      reading_date: startTs,
      meter_version: 1,
    };
    const currReading = {
      id: 'r-2',
      meter_group_id: 'mg-1',
      property_id: 'prop-1',
      reading_amount: 5.5,
      reading_date: endTs,
      meter_version: 2,
    };
    const submeterProperty = {
      id: 'prop-1',
      meter_groups: {
        water: {
          meter_group_id: 'mg-1',
          is_main_meter: false,
          current_version: 2,
          versions: { '1': { reset_at: startTs, last_reading: 634 } },
        },
      },
    };
    const meterGroup = { id: 'mg-1', current_version: 5, versions: {} };

    beforeEach(() => {
      jest.mocked(readingRepository.getByIds).mockResolvedValue([prevReading, currReading] as any);
      jest.mocked(propertyRepository.getByIds).mockResolvedValue([submeterProperty] as any);
      jest.mocked(meterGroupRepository.getByIds).mockResolvedValue([meterGroup] as any);
    });

    it('accepts the correct true-reading delta across the reset (5.5)', async () => {
      await expect(
        validator.validateSubmeterConsumption({
          meter_group_id: 'mg-1',
          billing_ids: { 'b-1': 5.5 },
        } as any)
      ).resolves.toBeUndefined();
    });

    it('rejects an overstated consumption that used the full true reading (639.5) instead of the delta', async () => {
      await expect(
        validator.validateSubmeterConsumption({
          meter_group_id: 'mg-1',
          billing_ids: { 'b-1': 639.5 },
        } as any)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('deviates more than 5%'),
      });
    });
  });

  describe('meter_group_id cross-check against billings\' readings', () => {
    const prevReading = {
      id: 'r-1',
      meter_group_id: 'mg-1',
      property_id: 'prop-1',
      reading_amount: 100,
      reading_date: startTs,
      meter_version: 1,
    };
    const currReading = {
      id: 'r-2',
      meter_group_id: 'mg-1',
      property_id: 'prop-1',
      reading_amount: 200,
      reading_date: endTs,
      meter_version: 1,
    };
    const property = { id: 'prop-1', meter_groups: {} };
    const meterGroup = { id: 'mg-1', current_version: 1, versions: {} };

    beforeEach(() => {
      jest.mocked(readingRepository.getByIds).mockResolvedValue([prevReading, currReading] as any);
      jest.mocked(propertyRepository.getByIds).mockResolvedValue([property] as any);
      jest.mocked(meterGroupRepository.getByIds).mockResolvedValue([meterGroup] as any);
    });

    it('rejects create when the cycle meter_group_id does not match its billings\' readings', async () => {
      await expect(
        validator.validateCreate({
          meter_group_id: 'mg-OTHER',
          billing_ids: { 'b-1': 100 },
          billing_rate: 5,
          billing_consumption: 100,
          billing_start_date: startTs,
          billing_end_date: endTs,
        } as any)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('meter group'),
      });
    });

    it('accepts create when the cycle meter_group_id matches its billings\' readings', async () => {
      await expect(
        validator.validateCreate({
          meter_group_id: 'mg-1',
          billing_ids: { 'b-1': 100 },
          billing_rate: 5,
          billing_consumption: 100,
          billing_start_date: startTs,
          billing_end_date: endTs,
        } as any)
      ).resolves.toBeUndefined();
    });

    it('rejects a PATCH changing only meter_group_id to one that does not match the stored billings', async () => {
      // Stored cycle is for mg-1 with b-1; PATCH switches only meter_group_id to
      // mg-OTHER, which no longer matches b-1's reading (mg-1).
      jest.mocked(billingCycleRepository.getById).mockResolvedValue(
        { id: 'bc-1', meter_group_id: 'mg-1', billing_ids: { 'b-1': 100 } } as any
      );
      await expect(
        validator.validateUpdate('bc-1', { meter_group_id: 'mg-OTHER' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('accepts a PATCH changing only meter_group_id to one that matches the stored billings', async () => {
      jest.mocked(billingCycleRepository.getById).mockResolvedValue(
        { id: 'bc-1', meter_group_id: 'mg-OTHER', billing_ids: { 'b-1': 100 } } as any
      );
      await expect(
        validator.validateUpdate('bc-1', { meter_group_id: 'mg-1' })
      ).resolves.toBeUndefined();
    });
  });
});
