export const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface FocusTrapOptions {
	active: boolean;
	onEscape?: () => void;
	lockScroll?: boolean;
}

/** Svelte action: traps Tab focus inside `node`, closes on Escape, restores focus on deactivate. */
export function focusTrap(node: HTMLElement, options: FocusTrapOptions) {
	let opts = options;
	let previouslyFocused: HTMLElement | null = null;

	function focusFirst() {
		node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab') {
			const focusable = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		} else if (e.key === 'Escape') {
			opts.onEscape?.();
		}
	}

	function activate() {
		previouslyFocused = document.activeElement as HTMLElement | null;
		focusFirst();
		node.addEventListener('keydown', handleKeydown);
		if (opts.lockScroll) document.body.classList.add('modal-open');
	}

	function deactivate() {
		node.removeEventListener('keydown', handleKeydown);
		if (opts.lockScroll) document.body.classList.remove('modal-open');
		previouslyFocused?.focus();
		previouslyFocused = null;
	}

	if (opts.active) activate();

	return {
		update(newOptions: FocusTrapOptions) {
			const wasActive = opts.active;
			opts = newOptions;
			if (!wasActive && opts.active) activate();
			else if (wasActive && !opts.active) deactivate();
		},
		destroy() {
			if (opts.active) deactivate();
		}
	};
}
