import { useSyncExternalStore } from 'react';
import type { ProfileMetadata } from '../../nostr/types';

type Listener = () => void;

/**
 * ProfileStore enables per-pubkey subscriptions so that PostCard components
 * only re-render when their specific author's profile changes, not when any
 * unrelated profile loads. This eliminates the "all feed cards re-render on
 * every profile fetch" flicker.
 */
export class ProfileStore {
  private profiles: Record<string, ProfileMetadata> = {};
  // Per-pubkey listener sets for targeted notifications
  private listeners: Map<string, Set<Listener>> = new Map();
  // Global listeners (for components that need the whole map)
  private globalListeners: Set<Listener> = new Set();

  merge(incoming: Record<string, ProfileMetadata>): void {
    const changed: string[] = [];
    for (const [pubkey, profile] of Object.entries(incoming)) {
      if (!profile) continue;
      const current = this.profiles[pubkey];
      if (current && profilesEqual(current, profile)) continue;
      this.profiles = { ...this.profiles, [pubkey]: profile };
      changed.push(pubkey);
    }
    if (changed.length === 0) return;
    // Notify per-pubkey listeners
    for (const pubkey of changed) {
      const set = this.listeners.get(pubkey);
      if (set) set.forEach((fn) => fn());
    }
    // Notify global listeners
    this.globalListeners.forEach((fn) => fn());
  }

  getProfile(pubkey: string): ProfileMetadata | undefined {
    return this.profiles[pubkey];
  }

  getAll(): Record<string, ProfileMetadata> {
    return this.profiles;
  }

  /** Subscribe to changes for a specific pubkey only. */
  subscribePubkey(pubkey: string, listener: Listener): () => void {
    let set = this.listeners.get(pubkey);
    if (!set) {
      set = new Set();
      this.listeners.set(pubkey, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) this.listeners.delete(pubkey);
    };
  }

  /** Subscribe to all profile changes (for components that need the full map). */
  subscribeAll(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  reset(): void {
    this.profiles = {};
    this.globalListeners.forEach((fn) => fn());
    this.listeners.forEach((set) => set.forEach((fn) => fn()));
  }
}

function profilesEqual(a: ProfileMetadata, b: ProfileMetadata): boolean {
  return (
    a.name === b.name &&
    a.display_name === b.display_name &&
    a.picture === b.picture &&
    a.banner === b.banner &&
    a.about === b.about &&
    a.website === b.website &&
    a.nip05 === b.nip05 &&
    a.lud16 === b.lud16 &&
    a.lud06 === b.lud06
  );
}

const EMPTY_PROFILES: Record<string, ProfileMetadata> = {};

/**
 * Subscribe to a single author's profile. The component only re-renders when
 * that specific author's profile changes. Accepts a nullable store so it can be
 * called unconditionally (Rules of Hooks) — returns undefined when store is null.
 */
export function useAuthorProfile(store: ProfileStore | null, pubkey: string | undefined): ProfileMetadata | undefined {
  return useSyncExternalStore(
    (listener) => {
      if (!store || !pubkey) return () => {};
      return store.subscribePubkey(pubkey, listener);
    },
    () => (store && pubkey ? store.getProfile(pubkey) : undefined),
    () => (store && pubkey ? store.getProfile(pubkey) : undefined)
  );
}

/**
 * Subscribe to the full profiles map. Re-renders on any profile change.
 * Use sparingly — prefer useAuthorProfile for per-card subscriptions.
 * Accepts a nullable store so it can be called unconditionally.
 */
export function useAllProfiles(store: ProfileStore | null): Record<string, ProfileMetadata> {
  return useSyncExternalStore(
    (listener) => store ? store.subscribeAll(listener) : () => {},
    () => store ? store.getAll() : EMPTY_PROFILES,
    () => store ? store.getAll() : EMPTY_PROFILES
  );
}
