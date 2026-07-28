interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
}

interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

let state = $state<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: false
});

let resolver: ((value: boolean) => void) | null = null;

export const confirmState = {
  get open() {
    return state.open;
  },
  get title() {
    return state.title;
  },
  get message() {
    return state.message;
  },
  get confirmLabel() {
    return state.confirmLabel;
  },
  get cancelLabel() {
    return state.cancelLabel;
  },
  get danger() {
    return state.danger;
  }
};

export function confirmAsync(
  title: string,
  message: string,
  options?: ConfirmOptions
): Promise<boolean> {
  // Resolve any stale pending confirm as cancelled before opening a new one.
  resolver?.(false);
  state = {
    open: true,
    title,
    message,
    confirmLabel: options?.confirmLabel ?? 'Confirm',
    cancelLabel: options?.cancelLabel ?? 'Cancel',
    danger: options?.danger ?? false
  };
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

export function resolveConfirm(result: boolean) {
  state = { ...state, open: false };
  resolver?.(result);
  resolver = null;
}
