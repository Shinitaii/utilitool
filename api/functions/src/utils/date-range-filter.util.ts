import {parseTimestamp} from "./firestore.util";
import type {BaseModel} from "./model.util";
import type {Timestamp} from "firebase-admin/firestore";

/**
 * Post-filters an in-memory list by a date range. Used for the cached (active-item)
 * search path in billing.service.ts / billing-cycle.service.ts, where dates can't be
 * pushed down into the Firestore query (CachedRepository.applyFilters only supports
 * equality filters — see its doc comment).
 *
 * startField/endField may be the same field (e.g. billing.billing_period_date) or
 * different fields (e.g. billing-cycle's billing_start_date / billing_end_date) —
 * the two comparisons are independent.
 */
export function applyDateRangeFilter<T extends BaseModel>(
  items: T[],
  options: {
    startDate?: string;
    endDate?: string;
    startField: keyof T & string;
    endField: keyof T & string;
  }
): T[] {
  let result = items;
  const {startDate, endDate, startField, endField} = options;

  if (startDate) {
    const start = new Date(startDate);
    result = result.filter(
      (item) => parseTimestamp(item[startField] as unknown as Timestamp).toDate() >= start
    );
  }
  if (endDate) {
    const end = new Date(endDate);
    result = result.filter(
      (item) => parseTimestamp(item[endField] as unknown as Timestamp).toDate() <= end
    );
  }

  return result;
}
