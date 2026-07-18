jest.mock('../property/property.repository');
jest.mock('../reading/reading.repository');
jest.mock('./billing.repository');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BillingValidator } from './billing.validator';
import { propertyRepository } from '../property/property.repository';
import { readingRepository } from '../reading/reading.repository';
import { billingRepository } from './billing.repository';
import { AppError } from '../../utils/error.util';
import { Timestamp } from 'firebase-admin/firestore';

const now = Timestamp.now();

const mockProperty = (id = 'prop-1') => ({
  id,
  room_name: 'Room 1',
  tenant_amount: 5,
  meter_groups: { electricity: 'mg-1' },
  is_deleted: false,
  deleted_at: null,
  created_at: now,
});

const mockReading = (id: string, meterGroupId: string, amount: number) => ({
  id,
  meter_group_id: meterGroupId,
  reading_amount: amount,
  reading_date: now,
  is_deleted: false,
  deleted_at: null,
  created_at: now,
});

describe('BillingValidator', () => {
  let validator: BillingValidator;

  beforeEach(() => {
    validator = new BillingValidator();
    jest.resetAllMocks();
    jest.mocked(billingRepository.search).mockResolvedValue({ data: [], hasMore: false, nextCursor: null } as any);
  });

  describe('validateCreate', () => {
    it('should pass when current reading > previous reading (same meter group)', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty() as any);
      // Call order: validateReadingExists(r-1), validateReadingExists(r-2),
      //   validateReadingsBelongToProperty → getById(r-1), getById(r-2), propertyRepository.getById
      jest.mocked(readingRepository.getById)
        .mockResolvedValueOnce(mockReading('r-1', 'mg-1', 100) as any) // validateReadingExists(r-1)
        .mockResolvedValueOnce(mockReading('r-2', 'mg-1', 200) as any) // validateReadingExists(r-2)
        .mockResolvedValueOnce(mockReading('r-1', 'mg-1', 100) as any) // belongs check: previousReading
        .mockResolvedValueOnce(mockReading('r-2', 'mg-1', 200) as any);// belongs check: currentReading

      await expect(validator.validateCreate({
        property_id: 'prop-1',
        previous_reading_id: 'r-1',
        current_reading_id: 'r-2',
      })).resolves.toBeUndefined();
    });

    it('should fail when current reading equals previous reading (meter rollback)', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty() as any);
      jest.mocked(readingRepository.getById)
        .mockResolvedValueOnce(mockReading('r-1', 'mg-1', 100) as any)
        .mockResolvedValueOnce(mockReading('r-2', 'mg-1', 100) as any)
        .mockResolvedValueOnce(mockReading('r-1', 'mg-1', 100) as any)
        .mockResolvedValueOnce(mockReading('r-2', 'mg-1', 100) as any);

      await expect(validator.validateCreate({
        property_id: 'prop-1',
        previous_reading_id: 'r-1',
        current_reading_id: 'r-2',
      })).rejects.toBeInstanceOf(AppError);
    });

    it('should fail when current reading is less than previous reading (meter rollback)', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty() as any);
      jest.mocked(readingRepository.getById)
        .mockResolvedValueOnce(mockReading('r-1', 'mg-1', 500) as any)
        .mockResolvedValueOnce(mockReading('r-2', 'mg-1', 400) as any)
        .mockResolvedValueOnce(mockReading('r-1', 'mg-1', 500) as any)
        .mockResolvedValueOnce(mockReading('r-2', 'mg-1', 400) as any);

      await expect(validator.validateCreate({
        property_id: 'prop-1',
        previous_reading_id: 'r-1',
        current_reading_id: 'r-2',
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should fail when readings belong to different meter groups', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty() as any);
      jest.mocked(readingRepository.getById)
        .mockResolvedValueOnce(mockReading('r-1', 'mg-1', 100) as any)
        .mockResolvedValueOnce(mockReading('r-2', 'mg-2', 200) as any)
        .mockResolvedValueOnce(mockReading('r-1', 'mg-1', 100) as any)
        .mockResolvedValueOnce(mockReading('r-2', 'mg-2', 200) as any);

      await expect(validator.validateCreate({
        property_id: 'prop-1',
        previous_reading_id: 'r-1',
        current_reading_id: 'r-2',
      })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('should fail when property does not exist', async () => {
      jest.mocked(propertyRepository.getById).mockResolvedValue(null);
      jest.mocked(readingRepository.getById).mockResolvedValue(mockReading('r-1', 'mg-1', 100) as any);

      await expect(validator.validateCreate({
        property_id: 'nonexistent',
        previous_reading_id: 'r-1',
        current_reading_id: 'r-2',
      })).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('validateUpdate — correction escape hatch', () => {
    const storedBilling = {
      id: 'billing-1',
      property_id: 'prop-1',
      previous_reading_id: 'r-prev',
      current_reading_id: 'r-old',
    };

    it('skips cross-entity validation when no reading id changes', async () => {
      await expect(validator.validateUpdate('billing-1', {})).resolves.toBeUndefined();
    });

    it('rejects a lone current_reading_id PATCH pointing at a different meter group', async () => {
      jest.mocked(billingRepository.getById).mockResolvedValue(storedBilling as any);
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty() as any);
      jest.mocked(readingRepository.getById).mockImplementation(async (id: string) => {
        if (id === 'r-prev') return mockReading('r-prev', 'mg-1', 100) as any;
        if (id === 'r-new') return mockReading('r-new', 'mg-2', 200) as any;
        return null;
      });

      await expect(
        validator.validateUpdate('billing-1', { current_reading_id: 'r-new' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('resolves a lone current_reading_id PATCH when same meter group and greater', async () => {
      jest.mocked(billingRepository.getById).mockResolvedValue(storedBilling as any);
      jest.mocked(propertyRepository.getById).mockResolvedValue(mockProperty() as any);
      jest.mocked(readingRepository.getById).mockImplementation(async (id: string) => {
        if (id === 'r-prev') return mockReading('r-prev', 'mg-1', 100) as any;
        if (id === 'r-new') return mockReading('r-new', 'mg-1', 300) as any;
        return null;
      });

      await expect(
        validator.validateUpdate('billing-1', { current_reading_id: 'r-new' })
      ).resolves.toBeUndefined();
    });

    it('rejects when the billing to update no longer exists', async () => {
      jest.mocked(billingRepository.getById).mockResolvedValue(null);

      await expect(
        validator.validateUpdate('billing-1', { current_reading_id: 'r-new' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
