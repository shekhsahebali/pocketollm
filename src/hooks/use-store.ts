import { useSyncExternalStore } from 'react';

/** Minimal external store: subscribe + getSnapshot, no extra dependency. */
export interface Store<T> {
  get: () => T;
  subscribe: (listener: () => void) => () => void;
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function createStore<T>(initial: T): Store<T> & { set: (next: T) => void } {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    set: (next) => {
      state = next;
      listeners.forEach((l) => l());
    },
  };
}
