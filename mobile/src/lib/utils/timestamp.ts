export interface FirestoreTimestamp {
  _seconds: number;
  _nanoseconds: number;
}

export function toDate(timestamp: FirestoreTimestamp | string | any): Date {
  // Handle ISO string
  if (typeof timestamp === 'string') {
    return new Date(timestamp);
  }

  // Handle null/undefined
  if (!timestamp || typeof timestamp !== 'object') {
    return new Date();
  }

  // Handle Firestore Timestamp object
  if ('_seconds' in timestamp) {
    const seconds = timestamp._seconds;
    const nanoseconds = timestamp._nanoseconds || 0;
    return new Date(seconds * 1000 + nanoseconds / 1000000);
  }

  // Fallback for direct Date constructor
  return new Date(timestamp);
}

export function formatTimestampDate(timestamp: FirestoreTimestamp | string | any): string {
  const date = toDate(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatTimestampDateTime(timestamp: FirestoreTimestamp | string | any): string {
  const date = toDate(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
