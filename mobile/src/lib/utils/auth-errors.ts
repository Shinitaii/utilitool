export function getReadableAuthError(error: any): string {
  if (typeof error === 'string') return error;
  if (!error) return 'Authentication failed';

  const code = error.code || '';
  const message = error.message || '';

  // Map Firebase error codes to user-friendly messages
  if (code === 'auth/invalid-email') {
    return 'Invalid email address';
  }
  if (code === 'auth/user-disabled') {
    return 'This account has been disabled';
  }
  if (code === 'auth/user-not-found' || code === 'auth/invalid-login-credentials' || code === 'auth/invalid-password') {
    return 'Invalid email or password';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many failed attempts. Please try again later';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error. Please check your connection';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'This authentication method is not available';
  }

  // Fallback to generic message for unknown errors
  return 'Unable to sign in. Please try again';
}
