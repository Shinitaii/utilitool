jest.mock('./reading.repository');
jest.mock('../../lib/gemini.lib');
jest.mock('../billing/billing.service');
jest.mock('../meter-group/meter-group.repository');
jest.mock('./reading.validator');
jest.mock('../property/property.repository');
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
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';
import { ReadingValidator } from './reading.validator';

const now = Timestamp.now();
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

      const result = await readingService.create({
        meter_group_id: 'mg-1',
        property_id: 'prop-100',
        reading_amount: 50,
        reading_date: Timestamp.now(),
      });

      expect(result.id).toBe('r-new');
      expect(findPreviousMonthReading).toHaveBeenCalledWith(
        'mg-1',
        'prop-100',
        expect.any(Object)
      );
      // billingService.createFromReadings must NOT have been called
      expect(billingService.createFromReadings).not.toHaveBeenCalled();
    });
  });

  describe('checkAnomalousReading - Anomaly Guard', () => {
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
        readingService.create({
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
      const result = await readingService.create({
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

      const result = await readingService.create({
        meter_group_id: 'mg-1',
        property_id: 'prop-1',
        reading_amount: 10000, // very high, would normally fail
        reading_date: now,
      });

      expect(result).toBeDefined();
    });
  });

  describe('createBatch - main meter exclusion', () => {
    it('should reject a batch that includes a main meter property', async () => {
      jest.mocked(readingRepository.search).mockResolvedValue({
        data: [],
        hasMore: false,
        nextCursor: null,
      });
      jest.mocked(propertyRepository.getById).mockResolvedValue({
        id: 'main-prop',
        meter_groups: {
          'entry-1': { meter_group_id: 'mg-1', is_main_meter: true },
        },
      } as any);

      await expect(
        readingService.createBatch([
          {
            meter_group_id: 'mg-1',
            property_id: 'main-prop',
            reading_amount: 100,
            reading_date: Timestamp.now(),
          },
        ])
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('readingService.createSeed', () => {
    it('should reject if property is not main meter for the meter group', async () => {
      jest.mocked(ReadingValidator.prototype.validateSeedCreate).mockRejectedValue(
        Object.assign(new Error('Not main meter'), { statusCode: 400 })
      );

      await expect(
        readingService.createSeed({
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
        readingService.createSeed({
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

      const result = await readingService.createSeed({
        meter_group_id: 'mg-1',
        property_id: 'main-prop',
        reading_amount: 100,
        reading_date: Timestamp.now(),
      });

      expect(result.property_id).toBe('main-prop');
      expect(readingRepository.create).toHaveBeenCalled();
    });
  });
});
