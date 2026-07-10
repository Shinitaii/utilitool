declare global {
  function $state<T>(init?: T): T;
  namespace $state {
    function snapshot<T>(value: T): T;
  }
  function $derived<T>(init: T): T;
  namespace $derived {
    function by<T>(init: () => T): T;
  }
  function $effect(init: () => (() => void) | void): void;
  namespace $effect {
    function pre(init: () => (() => void) | void): void;
  }
  function $props(): Record<string, any>;
  function $bindable<T = any>(init?: T): T;
}

export {};
