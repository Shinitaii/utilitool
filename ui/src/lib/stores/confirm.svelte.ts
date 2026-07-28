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

interface QueuedConfirm {
	title: string;
	message: string;
	options?: ConfirmOptions;
	resolve: (value: boolean) => void;
}

let resolver: ((value: boolean) => void) | null = null;
let queue: QueuedConfirm[] = [];

function openNext() {
	const next = queue.shift();
	if (!next) return;
	state = {
		open: true,
		title: next.title,
		message: next.message,
		confirmLabel: next.options?.confirmLabel ?? 'Confirm',
		cancelLabel: next.options?.cancelLabel ?? 'Cancel',
		danger: next.options?.danger ?? false
	};
	resolver = next.resolve;
}

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
	// Queued rather than resolved-as-cancelled: a second call while one is pending
	// waits its turn instead of silently dropping the first action (see finding #6).
	return new Promise((resolve) => {
		queue.push({ title, message, options, resolve });
		if (!state.open) openNext();
	});
}

export function resolveConfirm(result: boolean) {
	state = { ...state, open: false };
	const currentResolver = resolver;
	resolver = null;
	currentResolver?.(result);
	openNext();
}
