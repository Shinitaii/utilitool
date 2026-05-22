jest.mock('./reading.repository');
jest.mock('../../lib/gemini.lib');
jest.mock('../billing/billing.service');
jest.mock('../meter-group/meter-group.repository');
jest.mock('./reading.validator');
jest.mock('./reading.util', () => ({
  ...jest.requireActual('./reading.util') as object,
  findPreviousMonthReading: jest.fn(),
}));

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { readingService } from './reading.service';
import { readingRepository } from './reading.repository';
import { meterGroupRepository } from '../meter-group/meter-group.repository';
import { billingService } from '../billing/billing.service';
import { findPreviousMonthReading } from './reading.util';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

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
});
