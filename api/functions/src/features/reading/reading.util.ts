import {Timestamp} from "firebase-admin/firestore";
import {AppError} from "../../utils/error.util";
import {readingRepository} from "./reading.repository";
import {firestore} from "../../config/firebase.config";
import {COLLECTIONS} from "../../constants/collection.constants";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Compute the start (inclusive) / end (exclusive) of the calendar month
 * immediately preceding the supplied reading_date, in Asia/Manila timezone.
 */
export function getPreviousMonthWindow(readingDate: Timestamp): { start: Timestamp; end: Timestamp } {
  const manilaMs = readingDate.toMillis() + MANILA_OFFSET_MS;
  const manilaDate = new Date(manilaMs);
  const year = manilaDate.getUTCFullYear();
  const month = manilaDate.getUTCMonth(); // 0-indexed, this is current month in Manila

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;

  const startManilaMs = Date.UTC(prevYear, prevMonth, 1) - MANILA_OFFSET_MS;
  const endManilaMs = Date.UTC(year, month, 1) - MANILA_OFFSET_MS;

  return {
    start: Timestamp.fromMillis(startManilaMs),
    end: Timestamp.fromMillis(endManilaMs),
  };
}

/**
 * Find the most recent reading for a specific property within a meter group
 * in the previous calendar month (Asia/Manila).
 * Returns {id, data} or null if none exists.
 */
export async function findPreviousMonthReading(
  meterGroupId: string,
  propertyId: string,
  readingDate: Timestamp
): Promise<{id: string; data: any} | null> {
  const prevWindow = getPreviousMonthWindow(readingDate);
  const prevReadingSnap = await firestore
    .collection(COLLECTIONS.READINGS)
    .where("meter_group_id", "==", meterGroupId)
    .where("property_id", "==", propertyId)
    .where("is_deleted", "==", false)
    .where("reading_date", ">=", prevWindow.start)
    .where("reading_date", "<", prevWindow.end)
    .orderBy("reading_date", "desc")
    .limit(1)
    .get();

  if (prevReadingSnap.empty) return null;

  const doc = prevReadingSnap.docs[0];
  return {
    id: doc.id,
    data: doc.data(),
  };
}

/**
 * Validate that current reading is greater than previous reading.
 * Meter rollback is only enforced when both readings have the same meter version.
 * If versions differ, the readings are from different meter cycles and comparison is skipped.
 */
export function validateMeterRollback(
  prevReadingAmount: number,
  prevMeterVersion: number,
  currReadingAmount: number,
  currMeterVersion: number
): void {
  if (currMeterVersion === prevMeterVersion && currReadingAmount <= prevReadingAmount) {
    throw new AppError(
      400,
      "Current reading must be greater than previous reading (meter rollback not allowed)"
    );
  }
}
