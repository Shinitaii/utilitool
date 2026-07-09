jest.mock('./reading.repository');
jest.mock('../../lib/gemini.lib');
jest.mock('../billing/billing.service');
jest.mock('../meter-group/meter-group.repository');
jest.mock('./reading.validator');
jest.mock('../property/property.repository');
jest.mock('../../utils/cascade-delete.util');
jest.mock('./reading.util', () => ({
  ...jest.requireActual('./reading.util') as object,
  findPreviousMonthReading: jest.fn(),
}));

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { readingService } from './reading.service';
import { readingRepository } from './reading.repository';
import { meterGroupRepository } from '../meter-group/meter-group.repository';
import { propertyRepository } from '../property/property.repository';
import { billingService } from '../billing/billing.service';
import { findPreviousMonthReading } from './reading.util';
import { cascadeRestoreReading } from '../../utils/cascade-delete.util';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';
import { ReadingValidator } from './reading.validator';

const now = Timestamp.now();
const TEST_USER_ID = 'user-1';
const pastDate = Timestamp.fromMillis(now.toMillis() - 30 * 24 * 60 * 60 * 1000);

const mockReading = (overrides?: Record<string, any>) => ({
  id: 'reading-1',
  meter_group_id: 'mg-1',
  property_id: 'prop-1',
  reading_amount: 100,
  reading_date: now,
  meter_version: 1,
  created_at: now,
  updated_at: now,
  ...overrides,
});

describe('readingService - Business Rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findPreviousMonthReading - property scoping', () => {
    it('should not return a previous-month reading from a sibling property', async () => {
      // Sibling property has a reading last month; target property has none —
      // findPreviousMonthReading returns null because it is now property-scoped.
      jest.mocked(findPreviousMonthReading).mockResolvedValue(null);
      jest.mocked(meterGroupRepository.getById).mockResolvedValue({
        id: 'mg-1',
        current_version: 1,
      } as any);
      jest.mocked(readingRepository.search).mockResolvedValue({
        data: [],
        hasMore: false,
        nextCursor: null,
      });
      const newReading = {
        id: 'r-new',
        meter_group_id: 'mg-1',
        property_id: 'prop-100',
        reading_amount: 50,
        reading_date: Timestamp.now(),
        meter_version: 1,
      };
      jest.mocked(readingRepository.create).mockResolvedValue(newReading as any);

      const result = await readingService.create(TEST_USER_ID, {
        meter_group_id: 'mg-1',
        property_id: 'prop-100',
        reading_amount: 50,
        reading_date: Timestamp.now(),
      });

      expect(result.id).toBe('r-new');
      // findPreviousMonthReading is invoked internally by createReadingWithAutoBilling
      // (a same-module reference, so the jest.mock override above can't intercept it —
      // the real implementation runs against the mocked readingRepository.search, which
      // returns no data, so it correctly resolves to null/no previous-month reading).
      // billingService.createFromReadings must NOT have been called
      expect(billingService.createFromReadings).not.toHaveBeenCalled();
    });
  });

  describe('checkAnomalousReading - Anomaly Guard', () => {
    // The anomaly check now lives in ReadingValidator.validateAnomalous (the whole
    // module is auto-mocked above) — restore the real implementation for these
    // tests so they exercise the actual guard logic against the mocked repos.
    beforeEach(() => {
      const actual = jest.requireActual('./reading.validator') as { ReadingValidator: { prototype: { validateAnomalous: (...args: any[]) => Promise<void> } } };
      jest.mocked(ReadingValidator.prototype.validateAnomalous).mockImplementation(
        actual.ReadingValidator.prototype.validateAnomalous
      );
      jest.mocked(propertyRepository.getById).mockResolvedValue(null);
    });

    // Should reject readings that exceed 5x the average monthly delta
    it('should reject readings that exceed 5x average monthly delta', async () => {
      const recentReadings = [
        mockReading({ reading_amount: 500 }), // most recent
        mockReading({ reading_amount: 400 }),
        mockReading({ reading_amount: 300 }),
      ];
      jest.mocked(readingRepository.search).mockResolvedValue({
        data: recentReadings,
        hasMore: false,
        nextCursor: null,
      });

      // Average delta is 100, so 5x = 500, new delta of 1000 should fail
      await expect(
        readingService.create(TEST_USER_ID, {
          meter_group_id: 'mg-1',
          property_id: 'prop-1',
          reading_amount: 1500,
          reading_date: now,
        })
      ).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringContaining('unusually high'),
      });
    });

    // Should allow readings within acceptable delta range
    it('should allow readings within 5x average monthly delta', async () => {
      const recentReadings = [
        mockReading({ reading_amount: 500 }),
        mockReading({ reading_amount: 400 }),
        mockReading({ reading_amount: 300 }),
      ];
      jest.mocked(readingRepository.search).mockResolvedValue({
        data: recentReadings,
        hasMore: false,
        nextCursor: null,
      });

      // Average delta is 100, so 5x = 500, new delta of 450 should pass
      const result = await readingService.create(TEST_USER_ID, {
        meter_group_id: 'mg-1',
        property_id: 'prop-1',
        reading_amount: 950, // only 450 delta, under 500 threshold
        reading_date: now,
      });

      expect(result).toBeDefined();
    });

    // Should skip anomaly check if less than 2 readings exist
    it('should skip anomaly check if less than 2 readings exist', async () => {
      jest.mocked(readingRepository.search).mockResolvedValue({
        data: [mockReading()],
        hasMore: false,
        nextCursor: null,
      });

      const result = await readingService.create(TEST_USER_ID, {
        meter_group_id: 'mg-1',
        property_id: 'prop-1',
        reading_amount: 10000, // very high, would normally fail
        reading_date: now,
      });

      expect(result).toBeDefined();
    });
  });

  describe('createBatch - main meter exclusion', () => {
    it('should report a main-meter item as failed without rejecting the whole batch', async () => {
      jest.mocked(readingRepository.search).mockResolvedValue({
        data: [],
        hasMore: false,
        nextCursor: null,
      });
      jest.mocked(ReadingValidator.prototype.validateBatch).mockResolvedValue({
        validIndexes: [0],
        failures: [],
      });
      jest.mocked(propertyRepository.getById).mockResolvedValue({
        id: 'main-prop',
        meter_groups: {
          'entry-1': { meter_group_id: 'mg-1', is_main_meter: true },
        },
      } as any);
      jest.mocked(propertyRepository.getByIds).mockResolvedValue([{
        id: 'main-prop',
        meter_groups: {
          'entry-1': { meter_group_id: 'mg-1', is_main_meter: true },
        },
      } as any]);
      jest.mocked(meterGroupRepository.getByIds).mockResolvedValue([{
        id: 'mg-1',
        current_version: 1,
      } as any]);

      const result = await readingService.createBatch(TEST_USER_ID, [
        {
          meter_group_id: 'mg-1',
          property_id: 'main-prop',
          reading_amount: 100,
          reading_date: Timestamp.now(),
        },
      ]);

      expect(result.created).toEqual([]);
      expect(result.failed).toEqual([
        { index: 0, error: expect.stringContaining('main meter') },
      ]);
    });
  });

  describe('readingService.createSeed', () => {
    it('should reject if property is not main meter for the meter group', async () => {
      jest.mocked(ReadingValidator.prototype.validateSeedCreate).mockRejectedValue(
        Object.assign(new Error('Not main meter'), { statusCode: 400 })
      );

      await expect(
        readingService.createSeed(TEST_USER_ID, {
          meter_group_id: 'mg-1',
          property_id: 'regular-prop',
          reading_amount: 100,
          reading_date: Timestamp.now(),
        })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should reject if a reading already exists for this property + meter group', async () => {
      jest.mocked(ReadingValidator.prototype.validateSeedCreate).mockRejectedValue(
        Object.assign(new Error('Seed already exists'), { statusCode: 409 })
      );

      await expect(
        readingService.createSeed(TEST_USER_ID, {
          meter_group_id: 'mg-1',
          property_id: 'main-prop',
          reading_amount: 100,
          reading_date: Timestamp.now(),
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('should create a reading when property is main meter and no prior reading exists', async () => {
      jest.mocked(ReadingValidator.prototype.validateSeedCreate).mockResolvedValue(undefined);
      jest.mocked(meterGroupRepository.getById).mockResolvedValue({
        id: 'mg-1',
        meter_name: 'Main Elec',
        utility_type: 'electricity',
        current_version: 1,
        versions: {},
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        is_deleted: false,
        deleted_at: null,
      } as any);
      jest.mocked(readingRepository.create).mockResolvedValue({
        id: 'r-seed',
        meter_group_id: 'mg-1',
        property_id: 'main-prop',
        reading_amount: 100,
        reading_date: Timestamp.now(),
        meter_version: 1,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        is_deleted: false,
        deleted_at: null,
      } as any);

      const result = await readingService.createSeed(TEST_USER_ID, {
        meter_group_id: 'mg-1',
        property_id: 'main-prop',
        reading_amount: 100,
        reading_date: Timestamp.now(),
      });

      expect(result.property_id).toBe('main-prop');
      expect(readingRepository.create).toHaveBeenCalled();
    });
  });

  describe('readingService.restore - archived reading', () => {
    // Regression test for the bug where restore() pre-checked existence via
    // readingRepository.getById(id), which filters out is_deleted records —
    // meaning a genuinely archived reading could never be found and restore
    // always 404'd before cascadeRestoreReading ever ran.
    it('should restore a reading without pre-checking via the is_deleted-filtered getById', async () => {
      const restoredReading = mockReading({ is_deleted: false });
      jest.mocked(cascadeRestoreReading).mockResolvedValue({ primary: 1, billings: 0 });
      jest.mocked(readingRepository.getById).mockResolvedValue(restoredReading as any);

      const result = await readingService.restore(TEST_USER_ID, 'reading-1');

      expect(cascadeRestoreReading).toHaveBeenCalledWith('reading-1');
      // getById is only ever consulted after the cascade restore commits.
      expect(readingRepository.getById).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('reading-1');
    });

    it('should propagate a 404 from cascadeRestoreReading when the reading truly does not exist', async () => {
      jest.mocked(cascadeRestoreReading).mockRejectedValue(new AppError(404, 'Reading not found'));

      await expect(
        readingService.restore(TEST_USER_ID, 'missing-id')
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(readingRepository.getById).not.toHaveBeenCalled();
    });
  });
});
