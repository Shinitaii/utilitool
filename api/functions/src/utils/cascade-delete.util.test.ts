jest.mock('../config/firebase.config');
jest.mock('./cache.util');
jest.mock('../lib/firestore.lib');

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  cascadeDeleteProperty,
  cascadeDeleteMeterGroup,
  cascadeDeleteReading,
  cascadeRestoreProperty,
  cascadeRestoreMeterGroup,
  cascadeRestoreReading,
} from './cascade-delete.util';
import { firestore } from '../config/firebase.config';
import { cacheDelPattern, cacheDel } from './cache.util';
import { collectionRef } from '../lib/firestore.lib';
import { Timestamp } from 'firebase-admin/firestore';

const READING_DATE = Timestamp.now();

describe('cascade-delete.util - Cache Invalidation', () => {
  let mockTxn: any;
  let mockCollectionRef: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup transaction mock
    // set/delete back the reading-lock doc lifecycle (see releaseReadingLock/
    // reclaimReadingLock in cascade-delete.util.ts): soft-deleting a reading
    // releases its month lock, restoring it reclaims that lock.
    mockTxn = {
      get: jest.fn(),
      update: jest.fn(),
      set: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };

    (firestore.runTransaction as jest.Mock).mockImplementation((callback) =>
      callback(mockTxn)
    );

    // Setup firestore.collection mock
    (firestore.collection as jest.Mock).mockReturnValue({
      doc: jest.fn((id) => ({
        ref: { update: jest.fn() },
      })),
    });

    // Setup collectionRef mock
    mockCollectionRef = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn(),
    };
    (collectionRef as jest.Mock).mockReturnValue(mockCollectionRef);

    // Setup cache mocks
    (cacheDelPattern as jest.Mock).mockResolvedValue(undefined);
    (cacheDel as jest.Mock).mockResolvedValue(undefined);
  });

  describe('cascadeDeleteProperty', () => {
    // Should delete property and cascade-soft-delete its readings + billings
    it('should soft-delete property and cascade-delete readings and billings', async () => {
      const propertyId = 'prop-1';
      const readingIds = ['reading-1', 'reading-2'];
      const billingIds = ['billing-1'];

      // Mock property exists
      mockTxn.get.mockResolvedValueOnce({
        exists: true,
        id: propertyId,
      });

      // Mock readings query
      const readingDocs = readingIds.map((id) => ({
        id,
        ref: { update: jest.fn() },
        data: () => ({ meter_group_id: 'mg-1', reading_date: READING_DATE }),
      }));
      mockCollectionRef.get.mockResolvedValueOnce({
        docs: readingDocs,
      });

      // Mock billings query
      const billingDocs = billingIds.map((id) => ({
        id,
        ref: { update: jest.fn() },
      }));
      mockCollectionRef.get.mockResolvedValueOnce({
        docs: billingDocs,
      });

      const result = await cascadeDeleteProperty(propertyId);

      expect(result).toEqual({
        primary: 1,
        readings: 2,
        billings: 1,
      });
      expect(mockTxn.update).toHaveBeenCalledWith(expect.anything(), {
        is_deleted: true,
        deleted_at: expect.any(Date),
      });
    });

    // Should invalidate both id caches and list-cache patterns for property, readings, billings
    it('should clear property, readings, and billings list caches', async () => {
      const propertyId = 'prop-1';

      mockTxn.get.mockResolvedValueOnce({ exists: true, id: propertyId });
      mockCollectionRef.get
        .mockResolvedValueOnce({ docs: [{ id: 'reading-1', ref: { update: jest.fn() }, data: () => ({ meter_group_id: 'mg-1', reading_date: READING_DATE }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'billing-1', ref: { update: jest.fn() } }] });

      await cascadeDeleteProperty(propertyId);

      // Verify cacheDelPattern was called for list caches
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:properties:all:*');
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:readings:all:*');
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:billings:all:*');

      // Verify cacheDel was called for id caches
      expect(cacheDel).toHaveBeenCalledWith(`utilitool:properties:id:${propertyId}`);
      expect(cacheDel).toHaveBeenCalledWith('utilitool:readings:id:reading-1');
      expect(cacheDel).toHaveBeenCalledWith('utilitool:billings:id:billing-1');
    });
  });

  describe('cascadeDeleteMeterGroup', () => {
    // Should delete meter group and cascade-soft-delete its readings + billings
    it('should soft-delete meter group and cascade-delete readings and billings', async () => {
      const meterGroupId = 'mg-1';
      const readingIds = ['reading-1', 'reading-2'];
      const billingIds = ['billing-1', 'billing-2'];

      mockTxn.get.mockResolvedValueOnce({
        exists: true,
        id: meterGroupId,
      });

      const readingDocs = readingIds.map((id) => ({
        id,
        ref: { update: jest.fn() },
        data: () => ({ meter_group_id: meterGroupId, property_id: 'prop-1', reading_date: READING_DATE }),
      }));
      mockCollectionRef.get.mockResolvedValueOnce({ docs: readingDocs });

      const billingDocs = billingIds.map((id) => ({
        id,
        ref: { update: jest.fn() },
        data: () => ({
          previous_reading_id: 'reading-1',
          current_reading_id: 'reading-2',
        }),
      }));
      mockCollectionRef.get.mockResolvedValueOnce({ docs: billingDocs });

      const result = await cascadeDeleteMeterGroup(meterGroupId);

      expect(result).toEqual({
        primary: 1,
        readings: 2,
        billings: 2,
      });
    });

    // Should invalidate meter-group, readings, and billings list caches
    it('should clear meter-group, readings, and billings list caches', async () => {
      const meterGroupId = 'mg-1';

      mockTxn.get.mockResolvedValueOnce({ exists: true, id: meterGroupId });
      mockCollectionRef.get
        .mockResolvedValueOnce({
          docs: [{ id: 'reading-1', ref: { update: jest.fn() }, data: () => ({ property_id: 'prop-1', reading_date: READING_DATE }) }],
        })
        .mockResolvedValueOnce({ docs: [] });

      await cascadeDeleteMeterGroup(meterGroupId);

      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:meter-groups:all:*');
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:readings:all:*');
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:billings:all:*');
    });
  });

  describe('cascadeDeleteReading', () => {
    // Should delete reading and cascade-soft-delete its billings
    it('should soft-delete reading and cascade-delete billings', async () => {
      const readingId = 'reading-1';
      const billingIds = ['billing-1', 'billing-2'];

      mockTxn.get.mockResolvedValueOnce({
        exists: true,
        id: readingId,
        data: () => ({ meter_group_id: 'mg-1', property_id: 'prop-1', reading_date: READING_DATE }),
      });

      const billingDocs = billingIds.map((id) => ({
        id,
        ref: { update: jest.fn() },
        data: () => ({
          previous_reading_id: readingId,
          current_reading_id: 'other-reading',
        }),
      }));
      // Mock returns all billings, test function filters by reading_id
      mockCollectionRef.get.mockResolvedValueOnce({ docs: billingDocs });

      const result = await cascadeDeleteReading(readingId);

      expect(result).toEqual({
        primary: 1,
        billings: 2,
      });
    });

    // Should clear readings and billings list caches (id caches for deleted items)
    it('should clear readings and billings list caches', async () => {
      const readingId = 'reading-1';

      mockTxn.get.mockResolvedValueOnce({
        exists: true,
        id: readingId,
        data: () => ({ meter_group_id: 'mg-1', property_id: 'prop-1', reading_date: READING_DATE }),
      });
      const billingDoc = {
        id: 'billing-1',
        ref: { update: jest.fn() },
        data: () => ({
          previous_reading_id: readingId,
          current_reading_id: 'other',
        }),
      };
      mockCollectionRef.get.mockResolvedValueOnce({
        docs: [billingDoc],
      });

      await cascadeDeleteReading(readingId);

      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:readings:all:*');
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:billings:all:*');
      expect(cacheDel).toHaveBeenCalledWith(`utilitool:readings:id:${readingId}`);
      expect(cacheDel).toHaveBeenCalledWith('utilitool:billings:id:billing-1');
    });
  });

  describe('cascadeRestoreProperty', () => {
    // Should restore property and cascade-restore its soft-deleted readings + billings
    it('should restore property and cascade-restore readings and billings', async () => {
      const propertyId = 'prop-1';
      const readingIds = ['reading-1', 'reading-2'];
      const billingIds = ['billing-1'];

      mockTxn.get.mockResolvedValueOnce({
        exists: true,
        id: propertyId,
      });

      const readingDocs = readingIds.map((id) => ({
        id,
        ref: { update: jest.fn() },
        data: () => ({ meter_group_id: 'mg-1', reading_date: READING_DATE }),
      }));

      const billingDocs = billingIds.map((id) => ({
        id,
        ref: { update: jest.fn() },
      }));

      // Setup: first call gets readings, second call gets billings
      // The mock needs to handle two separate collectionRef(...).where(...).where(...).get() calls
      mockCollectionRef.get
        .mockResolvedValueOnce({ docs: readingDocs, size: readingDocs.length })
        .mockResolvedValueOnce({ docs: billingDocs, size: billingDocs.length });

      const result = await cascadeRestoreProperty(propertyId);

      expect(result).toEqual({
        primary: 1,
        readings: 2,
        billings: 1,
      });

      // Verify update calls set is_deleted: false
      expect(mockTxn.update).toHaveBeenCalledWith(expect.anything(), {
        is_deleted: false,
        deleted_at: null,
      });
    });

    // Should invalidate list caches so restored items are re-fetched fresh from Firestore
    it('should clear property, readings, and billings list caches on restore', async () => {
      const propertyId = 'prop-1';

      mockTxn.get.mockResolvedValueOnce({ exists: true, id: propertyId });
      mockCollectionRef.get
        .mockResolvedValueOnce({ docs: [{ id: 'reading-1', ref: { update: jest.fn() }, data: () => ({ meter_group_id: 'mg-1', reading_date: READING_DATE }) }] })
        .mockResolvedValueOnce({ docs: [{ id: 'billing-1', ref: { update: jest.fn() } }] });

      await cascadeRestoreProperty(propertyId);

      // List caches should be cleared, forcing a fresh repopulate
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:properties:all:*');
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:readings:all:*');
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:billings:all:*');
    });
  });

  describe('cascadeRestoreMeterGroup', () => {
    // Should restore meter group and cascade-restore its soft-deleted readings + billings
    it('should restore meter group and cascade-restore readings and billings', async () => {
      const meterGroupId = 'mg-1';

      mockTxn.get.mockResolvedValueOnce({
        exists: true,
        id: meterGroupId,
      });

      mockCollectionRef.get
        .mockResolvedValueOnce({
          docs: [
            { id: 'reading-1', ref: { update: jest.fn() }, data: () => ({ property_id: 'prop-1', reading_date: READING_DATE }) },
            { id: 'reading-2', ref: { update: jest.fn() }, data: () => ({ property_id: 'prop-1', reading_date: READING_DATE }) },
          ],
        })
        .mockResolvedValueOnce({
          docs: [
            {
              id: 'billing-1',
              ref: { update: jest.fn() },
              data: () => ({ previous_reading_id: 'reading-1', current_reading_id: 'reading-2' }),
            },
          ],
        });

      const result = await cascadeRestoreMeterGroup(meterGroupId);

      expect(result).toEqual({
        primary: 1,
        readings: 2,
        billings: 1,
      });
    });

    // Should clear meter-group, readings, and billings list caches on restore
    it('should clear meter-group, readings, and billings list caches on restore', async () => {
      const meterGroupId = 'mg-1';

      mockTxn.get.mockResolvedValueOnce({ exists: true, id: meterGroupId });
      mockCollectionRef.get
        .mockResolvedValueOnce({ docs: [{ id: 'reading-1', ref: { update: jest.fn() }, data: () => ({ property_id: 'prop-1', reading_date: READING_DATE }) }] })
        .mockResolvedValueOnce({ docs: [] });

      await cascadeRestoreMeterGroup(meterGroupId);

      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:meter-groups:all:*');
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:readings:all:*');
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:billings:all:*');
    });
  });

  describe('cascadeRestoreReading', () => {
    // Should restore reading and cascade-restore its soft-deleted billings
    it('should restore reading and cascade-restore billings', async () => {
      const readingId = 'reading-1';

      mockTxn.get.mockResolvedValueOnce({
        exists: true,
        id: readingId,
        data: () => ({ meter_group_id: 'mg-1', property_id: 'prop-1', reading_date: READING_DATE }),
      });

      mockCollectionRef.get.mockResolvedValueOnce({
        docs: [
          {
            id: 'billing-1',
            ref: { update: jest.fn() },
            data: () => ({ previous_reading_id: readingId, current_reading_id: 'other' }),
          },
          {
            id: 'billing-2',
            ref: { update: jest.fn() },
            data: () => ({ previous_reading_id: 'other', current_reading_id: readingId }),
          },
        ],
      });

      const result = await cascadeRestoreReading(readingId);

      expect(result).toEqual({
        primary: 1,
        billings: 2,
      });
    });

    // If a different reading already reclaimed the meter_group+property+month
    // lock in the meantime (e.g. another reading was created/restored for the
    // same slot after this one was deleted), reclaimReadingLock's txn.create()
    // must fail loudly with ALREADY_EXISTS rather than silently overwriting the
    // other reading's lock — runCascadeTransaction converts that into a clean
    // 409 instead of letting the raw Firestore error or a generic 500 through.
    it('should reject with 409 instead of silently overwriting when the reading lock was already reclaimed by another reading', async () => {
      const readingId = 'reading-1';

      mockTxn.get.mockResolvedValueOnce({
        exists: true,
        id: readingId,
        data: () => ({ meter_group_id: 'mg-1', property_id: 'prop-1', reading_date: READING_DATE }),
      });

      mockTxn.create.mockImplementation(() => {
        const err: any = new Error('ALREADY_EXISTS: Document already exists');
        err.code = 6;
        throw err;
      });

      // The mocked txn.update (unlike real Firestore) doesn't roll back on a
      // later throw within the same callback — the assertion here is on the
      // rejection itself; real Firestore atomicity guarantees nothing commits.
      await expect(cascadeRestoreReading(readingId)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Cannot restore: another active reading already occupies this meter group/property/month.',
      });
    });

    // Should clear readings and billings list caches on restore
    it('should clear readings and billings list caches on restore', async () => {
      const readingId = 'reading-1';

      mockTxn.get.mockResolvedValueOnce({
        exists: true,
        id: readingId,
        data: () => ({ meter_group_id: 'mg-1', property_id: 'prop-1', reading_date: READING_DATE }),
      });
      mockCollectionRef.get.mockResolvedValueOnce({
        docs: [{ id: 'billing-1', ref: { update: jest.fn() }, data: () => ({}) }],
      });

      await cascadeRestoreReading(readingId);

      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:readings:all:*');
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:billings:all:*');
    });
  });

  describe('Cache Bug Prevention - No Duplicate Entries', () => {
    // Warm list cache with stale entry → restore updates id cache → list cache pattern delete forces repopulate
    // (This is a behavioral test confirming the fix: cacheDelPattern prevents listAppend duplicate-entry bug)
    it('should prevent duplicate entries by invalidating list cache on restore instead of appending', async () => {
      const propertyId = 'prop-1';

      // Scenario: list cache is warm with a stale is_deleted: true entry from before archive
      // Old bug: listAppend would push a duplicate when the cache was warm
      // New fix: cacheDelPattern invalidates the cache, next GET repopulates cleanly

      mockTxn.get.mockResolvedValueOnce({ exists: true, id: propertyId });
      mockCollectionRef.get
        .mockResolvedValueOnce({ docs: [] }) // no readings
        .mockResolvedValueOnce({ docs: [] }); // no billings

      await cascadeRestoreProperty(propertyId);

      // Verify: list caches were pattern-deleted, not updated with listAppend
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:readings:all:*');
      expect(cacheDelPattern).toHaveBeenCalledWith('utilitool:billings:all:*');

      // Verify: cacheDel was called for id caches (not listAppend)
      // This forces a fresh GET from Firestore on next list fetch, avoiding duplicates
      expect(cacheDel).toHaveBeenCalledWith(`utilitool:properties:id:${propertyId}`);
    });
  });
});
