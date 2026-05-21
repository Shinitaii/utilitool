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

const validator = new BillingValidator();

type BillingSearchOptions = {
  propertyId?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit: number;
  cursor?: string | null;
  archived?: boolean;
};

export const billingService = {
  async create(data: CreateBillingDTO): Promise<Billing> {
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
        payment_status: 'pending' as const,
        created_at: FieldValue.serverTimestamp(),
        is_deleted: false,
        deleted_at: null,
      });
    });

    // Read the newly created document after the transaction commits
    const snap = await firestore.collection(COLLECTIONS.BILLINGS).doc(newBillingId!).get();
    return snapshotToModel<Billing>(snap);
  },

  async createBatch(data: CreateBillingDTO[]): Promise<Billing[]> {
    await validator.validateBatch(data);
    return billingRepository.createBatch(
      data.map((item) => ({
        ...item,
        payment_status: 'pending' as const,
      }))
    );
  },

  async search(options: BillingSearchOptions): Promise<PaginatedResult<Billing>> {
    return billingRepository.search({
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

  async getById(id: string): Promise<Billing | null> {
    return billingRepository.getById(id);
  },

  async update(id: string, data: Partial<CreateBillingDTO> & { payment_status?: 'pending' | 'paid'; paid_at?: string }): Promise<Billing> {
    await validator.validateUpdate(data);

    const updateData = { ...data };
    if (data.payment_status === 'paid' && !data.paid_at) {
      updateData.paid_at = new Date().toISOString();
    }

    return billingRepository.update(id, updateData);
  },

  async updateBatch(updates: {id: string, data: Partial<CreateBillingDTO>}[]): Promise<Billing[]> {
    await validator.validateUpdateBatch(updates);
    return billingRepository.updateBatch(updates);
  },

  async delete(id: string): Promise<void> {
    return billingRepository.delete(id);
  },

  async softDelete(id: string): Promise<Billing> {
    return billingRepository.softDelete(id);
  },

  async restore(id: string): Promise<Billing> {
    const billing = await billingRepository.getById(id);
    if (!billing) {
      throw new AppError(404, "Billing not found");
    }
    return billingRepository.restore(id);
  },

  /**
   * Write a new billing document within an already-open Firestore transaction.
   * Called by the reading service when auto-creating billings during a reading
   * create/update transaction. Existence checks are skipped because the caller
   * has already verified the documents inside the same transaction.
   *
   * Applies the meter_version rollback bypass: if currReading.meter_version differs
   * from prevReading.meter_version the reading_amount comparison is not enforced.
   */
  createFromReadings(
    txn: Transaction,
    propertyId: string,
    prevReadingId: string,
    currReadingId: string,
    prevReading: DocumentData,
    currReading: DocumentData,
  ): void {
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
      payment_status: 'pending' as const,
      created_at: FieldValue.serverTimestamp(),
      is_deleted: false,
      deleted_at: null,
    });
  },
};
