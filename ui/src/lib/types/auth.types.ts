export interface AuthUser {
  userId: string;
  email: string;
  display_name: string;
  role: 'admin' | 'landlord' | 'assistant';
  qr_payment_url?: string | null;
}
