export type ToastVariant = 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
}

const AUTO_DISMISS_MS = 4000;
const MAX_STACKED = 2;

let toasts = $state<ToastMessage[]>([]);

export const toastState = {
  get toasts() {
    return toasts;
  }
};

export function pushToast(message: string, variant: ToastVariant = 'success') {
  const id = Math.random().toString(36).slice(2);
  toasts = [...toasts, { id, message, variant }].slice(-MAX_STACKED);
  setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
}
