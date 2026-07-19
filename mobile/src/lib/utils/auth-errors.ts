// Maps Firebase auth error codes to user-friendly messages.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Invalid email address',
  'auth/user-disabled': 'This account has been disabled',
  'auth/user-not-found': 'Invalid email or password',
  'auth/invalid-login-credentials': 'Invalid email or password',
  'auth/invalid-password': 'Invalid email or password',
  'auth/too-many-requests': 'Too many failed attempts. Please try again later',
  'auth/network-request-failed': 'Network error. Please check your connection',
  'auth/operation-not-allowed': 'This authentication method is not available'
};

export function getReadableAuthError(error: any): string {
  if (typeof error === 'string') return error;
  if (!error) return 'Authentication failed';

  return AUTH_ERROR_MESSAGES[error.code] || 'Unable to sign in. Please try again';
}
