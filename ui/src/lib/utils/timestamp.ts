import type { FirestoreTimestamp } from '$lib/types/api.types';

export function toDate(timestamp: FirestoreTimestamp | string): Date {
  if (typeof timestamp === 'string') {
    return new Date(timestamp);
  }

  if (!timestamp || typeof timestamp !== 'object') {
    return new Date();
  }

  if ('_seconds' in timestamp) {
    const seconds = (timestamp as FirestoreTimestamp)._seconds;
    const nanoseconds = (timestamp as FirestoreTimestamp)._nanoseconds || 0;
    return new Date(seconds * 1000 + nanoseconds / 1000000);
  }

  return new Date();
}

export function toTimestamp(date: Date): FirestoreTimestamp {
  const ms = date.getTime();
  const seconds = Math.floor(ms / 1000);
  const nanoseconds = (ms % 1000) * 1000000;

  return {
    _seconds: seconds,
    _nanoseconds: nanoseconds
  };
}

export function toISOString(timestamp: FirestoreTimestamp | string): string {
  return toDate(timestamp).toISOString();
}

export function fromISOString(iso: string): FirestoreTimestamp {
  return toTimestamp(new Date(iso));
}
