import {DocumentSnapshot, Timestamp} from "firebase-admin/firestore";
import {BaseModel} from "./model.util";

export const snapshotToModel = <T extends BaseModel>(snapshot: DocumentSnapshot) => {
  const data = snapshot.data();

  if (!data) {
    throw new Error(`Document ${snapshot.ref.path} does not exist.`);
  }

  return {
    ...(data as Omit<T, "id">),
    id: snapshot.id,
  } as T;
};

export const parseTimestamp = (value: unknown): Timestamp => {
  // If already a Firestore Timestamp instance
  if (value instanceof Timestamp) {
    return value;
  }

  // If a plain object with _seconds and _nanoseconds (serialized Timestamp)
  if (
    typeof value === "object" &&
    value !== null &&
    "_seconds" in value &&
    "_nanoseconds" in value
  ) {
    const obj = value as Record<string, unknown>;
    return new Timestamp(obj._seconds as number, obj._nanoseconds as number);
  }

  // If an ISO 8601 string
  if (typeof value === "string") {
    return Timestamp.fromDate(new Date(value));
  }

  // If a number (Unix timestamp in seconds or milliseconds)
  if (typeof value === "number") {
    // Assume milliseconds if > 10^11 (epoch in ms), seconds otherwise
    const ms = value > 1e11 ? value : value * 1000;
    return Timestamp.fromDate(new Date(ms));
  }

  throw new Error(
    `Cannot parse timestamp. Expected Timestamp, ISO string, Unix timestamp (number), or object with _seconds/_nanoseconds. Got: ${typeof value}`
  );
};
