import {FieldValue, Transaction, DocumentData} from "firebase-admin/firestore";
import {firestore} from "../../config/firebase.config";
import {billingRepository} from "./billing.repository";
import {Billing} from "./billing.model";
import {CreateBillingDTO} from "./billing.dto";
import {PaginatedResult} from "../../utils/pagination.util";
import {BillingValidator} from "./billing.validator";
import {AppError} from "../../utils/error.util";
import {COLLECTIONS} from "../../constants/collection.constants";
import {snapshotToModel} from "../../utils/firestore.util";
import {validateMeterRollback} from "../reading/reading.util";
import {cacheSet} from "../../utils/cache.util";
import {CachedRepository} from "../../lib/cached-repository.lib";

const validator = new BillingValidator();
const CACHE_TTL = 10 * 60; // 10 minutes

type BillingSearchOptions = {
  propertyId?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

export const billingService = {
  async create(userId: string, data: CreateBillingDTO): Promise<Billing> {
    // Run validation + creation inside a transaction so referenced documents
    // cannot be deleted between validation reads and the billing write.
    let newBillingId: string | null = null;

    await firestore.runTransaction(async (txn) => {
      const propertyRef = firestore.collection(COLLECTIONS.PROPERTIES).doc(data.property_id);
      const prevReadingRef = firestore.collection(COLLECTIONS.READINGS).doc(data.previous_reading_id);
      const currReadingRef = firestore.collection(COLLECTIONS.READINGS).doc(data.current_reading_id);

      // All reads must come before writes in a Firestore transaction
      const [propertySnap, prevReadingSnap, currReadingSnap] = await Promise.all([
        txn.get(propertyRef),
        txn.get(prevReadingRef),
        txn.get(currReadingRef),
      ]);

      if (!propertySnap.exists || propertySnap.data()?.is_deleted) {
        throw new AppError(404, "Property not found");
      }
      if (!prevReadingSnap.exists || prevReadingSnap.data()?.is_deleted) {
        throw new AppError(404, "Previous reading not found");
      }
      if (!currReadingSnap.exists || currReadingSnap.data()?.is_deleted) {
        throw new AppError(404, "Current reading not found");
      }

      const prevReading = prevReadingSnap.data()!;
      const currReading = currReadingSnap.data()!;

      if (prevReading.meter_group_id !== currReading.meter_group_id) {
        throw new AppError(400, "Previous and current readings must belong to the same meter group");
      }
      const currMeterVersion = (currReading.meter_version ?? 1) as number;
      const prevMeterVersion = (prevReading.meter_version ?? 1) as number;
      validateMeterRollback(
        prevReading.reading_amount,
        prevMeterVersion,
        currReading.reading_amount,
        currMeterVersion
      );

      const newRef = firestore.collection(COLLECTIONS.BILLINGS).doc();
      newBillingId = newRef.id;
      txn.set(newRef, {
        ...data,
        payment_status: "pending" as const,
        created_at: FieldValue.serverTimestamp(),
        is_deleted: false,
        deleted_at: null,
      });
    });

    // Read the newly created document after the transaction commits
    const snap = await firestore.collection(COLLECTIONS.BILLINGS).doc(newBillingId!).get();
    const billing = snapshotToModel<Billing>(snap);
    await cacheSet(`utilitool:billings:id:${billing.id}`, billing, CACHE_TTL);
    return billing;
  },

  async createBatch(userId: string, data: CreateBillingDTO[]): Promise<Billing[]> {
    await validator.validateBatch(data);
    const cachedRepo = new CachedRepository(billingRepository, userId, "billings", CACHE_TTL);
    const created = await cachedRepo.createBatch(
      data.map((item) => ({
        ...item,
        payment_status: "pending" as const,
      }))
    );
    return created;
  },

  async search(userId: string, options: BillingSearchOptions): Promise<PaginatedResult<Billing>> {
    const cachedRepo = new CachedRepository(billingRepository, userId, "billings", CACHE_TTL);
    return cachedRepo.search({
      limit: options.limit,
      orderBy: (options.sortBy ?? "created_at") as any,
      orderDirection: options.sortOrder ?? "desc",
      cursor: options.cursor,
      archived: options.archived,
      filters: {
        ...(options.propertyId ? {property_id: options.propertyId} : {}),
      },
    });
  },

  async getById(userId: string, id: string): Promise<Billing | null> {
    const cachedRepo = new CachedRepository(billingRepository, userId, "billings", CACHE_TTL);
    return cachedRepo.getById(id);
  },

  async update(userId: string, id: string, data: Partial<CreateBillingDTO> & { payment_status?: "pending" | "paid"; paid_at?: string }): Promise<Billing> {
    await validator.validateUpdate(data);

    const updateData = {...data};
    if (data.payment_status === "paid" && !data.paid_at) {
      updateData.paid_at = new Date().toISOString();
    }

    const cachedRepo = new CachedRepository(billingRepository, userId, "billings", CACHE_TTL);
    return cachedRepo.update(id, updateData);
  },

  async updateBatch(userId: string, updates: {id: string, data: Partial<CreateBillingDTO>}[]): Promise<Billing[]> {
    await validator.validateUpdateBatch(updates);
    const cachedRepo = new CachedRepository(billingRepository, userId, "billings", CACHE_TTL);
    return cachedRepo.updateBatch(updates);
  },

  async delete(userId: string, id: string): Promise<void> {
    const cachedRepo = new CachedRepository(billingRepository, userId, "billings", CACHE_TTL);
    await cachedRepo.delete(id);
  },

  async softDelete(userId: string, id: string): Promise<Billing> {
    const cachedRepo = new CachedRepository(billingRepository, userId, "billings", CACHE_TTL);
    return cachedRepo.softDelete(id);
  },

  async restore(userId: string, id: string): Promise<Billing> {
    const billing = await billingRepository.getById(id);
    if (!billing) {
      throw new AppError(404, "Billing not found");
    }
    const cachedRepo = new CachedRepository(billingRepository, userId, "billings", CACHE_TTL);
    return cachedRepo.restore(id);
  },

  /**
   * Write a new billing document within an already-open Firestore transaction.
   * Called by the reading service when auto-creating billings during a reading
   * create/update transaction. Existence checks are skipped because the caller
   * has already verified the documents inside the same transaction.
   *
   * Applies the meter_version rollback bypass: if currReading.meter_version differs
   * from prevReading.meter_version the reading_amount comparison is not enforced.
   *
   * Returns the newly generated billing ID for cache population post-transaction.
   */
  createFromReadings(
    txn: Transaction,
    propertyId: string,
    prevReadingId: string,
    currReadingId: string,
    prevReading: DocumentData,
    currReading: DocumentData,
  ): string {
    if (prevReading.meter_group_id !== currReading.meter_group_id) {
      throw new AppError(400, "Previous and current readings must belong to the same meter group");
    }
    const currMeterVersion = (currReading.meter_version ?? 1) as number;
    const prevMeterVersion = (prevReading.meter_version ?? 1) as number;
    validateMeterRollback(
      prevReading.reading_amount,
      prevMeterVersion,
      currReading.reading_amount,
      currMeterVersion
    );

    const newRef = firestore.collection(COLLECTIONS.BILLINGS).doc();
    txn.set(newRef, {
      property_id: propertyId,
      previous_reading_id: prevReadingId,
      current_reading_id: currReadingId,
      payment_status: "pending" as const,
      created_at: FieldValue.serverTimestamp(),
      is_deleted: false,
      deleted_at: null,
    });
    return newRef.id;
  },
};
