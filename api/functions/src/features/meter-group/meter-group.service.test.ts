jest.mock('./meter-group.repository');
jest.mock('../reading/reading.repository');
jest.mock('../../lib/firestore.lib');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { meterGroupService } from './meter-group.service';
import { meterGroupRepository } from './meter-group.repository';
import { readingRepository } from '../reading/reading.repository';
import { collectionRef } from '../../lib/firestore.lib';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

const now = Timestamp.now();
const TEST_USER_ID = 'user-1';

const mockMeterGroup = (overrides?: Record<string, any>) => ({
  id: 'mg-1',
  meter_name: 'Electricity Meter',
  utility_type: 'electricity',
  current_version: 1,
  versions: {},
  created_at: now,
  updated_at: now,
  ...overrides,
});

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

describe('meterGroupService - Business Rules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordReset', () => {
    // Should increment meter version and record reset metadata
    it('should increment meter version and record reset with latest reading data', async () => {
      const meterGroup = mockMeterGroup({ current_version: 1 });
      const latestReading = mockReading({ reading_amount: 500 });

      jest.mocked(meterGroupRepository.getById).mockResolvedValue(meterGroup);
      jest.mocked(readingRepository.search).mockResolvedValue({
        data: [latestReading],
        hasMore: false,
        nextCursor: null,
      });
      jest.mocked(meterGroupRepository.update).mockResolvedValue({
        ...meterGroup,
        current_version: 2,
        versions: {
          '1': {
            reset_at: expect.any(Object),
            last_reading: 500,
          },
        },
      });

      const result = await meterGroupService.recordReset(TEST_USER_ID, 'mg-1');

      expect(meterGroupRepository.update).toHaveBeenCalledWith('mg-1', {
        current_version: 2,
        versions: expect.objectContaining({
          '1': expect.objectContaining({
            last_reading: 500,
            reset_at: expect.any(Object),
          }),
        }),
      });
      expect(result.current_version).toBe(2);
    });

    // Should fail if no readings exist for the meter group
    it('should fail if no readings exist for meter group', async () => {
      const meterGroup = mockMeterGroup();
      jest.mocked(meterGroupRepository.getById).mockResolvedValue(meterGroup);
      jest.mocked(readingRepository.search).mockResolvedValue({
        data: [],
        hasMore: false,
        nextCursor: null,
      });

      await expect(meterGroupService.recordReset(TEST_USER_ID, 'mg-1')).rejects.toMatchObject({
        statusCode: 422,
        message: expect.stringContaining('no readings found'),
      });
    });

    // Should fail if meter group does not exist
    it('should fail if meter group does not exist', async () => {
      jest.mocked(meterGroupRepository.getById).mockResolvedValue(null);

      await expect(meterGroupService.recordReset(TEST_USER_ID, 'bad-mg')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Meter group not found',
      });
    });
  });

  describe('delete - Cascade Constraint', () => {
    // Should prevent hard delete if active readings reference the meter group
    it('should prevent delete if active readings reference meter group', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: false, docs: [{ id: 'reading-1' }] }),
      };
      jest.mocked(collectionRef).mockReturnValue(mockQuery as any);

      await expect(meterGroupService.delete(TEST_USER_ID, 'mg-1')).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('has active readings'),
      });
    });

    // Should allow delete if no active readings exist
    it('should allow delete if no active readings exist', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
      jest.mocked(collectionRef).mockReturnValue(mockQuery as any);
      jest.mocked(meterGroupRepository.delete).mockResolvedValue(undefined);

      await meterGroupService.delete(TEST_USER_ID, 'mg-1');

      expect(meterGroupRepository.delete).toHaveBeenCalledWith('mg-1');
    });
  });
});
