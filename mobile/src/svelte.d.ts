declare global {
  function $state<T>(init?: T): T;
  function $state.snapshot<T>(value: T): T;
  function $derived<T>(init: T): T;
  function $derived.by<T>(init: () => T): T;
  function $effect(init: () => (() => void) | void): void;
  function $effect.pre(init: () => (() => void) | void): void;
  function $props(): Record<string, any>;
  function $bindable<T = any>(init?: T): T;
}

export {};
