import type { AppSettings } from './types';
import { loadSettings, saveSettings } from './db';

export class SettingsStore {
  constructor(private defaults: AppSettings) {}

  async load(): Promise<AppSettings> {
    const stored = await loadSettings(this.defaults);
    return mergeSettings(this.defaults, stored);
  }

  async save(settings: AppSettings): Promise<void> {
    await saveSettings(settings);
  }

  async updateSection<K extends keyof AppSettings>(
    settings: AppSettings,
    section: K,
    value: AppSettings[K]
  ): Promise<AppSettings> {
    const next = { ...settings, [section]: value };
    await this.save(next);
    return next;
  }
}

function mergeSettings(defaults: AppSettings, stored?: AppSettings): AppSettings {
  if (!stored) return defaults;
  const relays = chooseArray(stored.relays, defaults.relays);
  const mediaRelays = chooseArray(stored.mediaRelays, defaults.mediaRelays);
  return {
    ...defaults,
    ...stored,
    relays,
    mediaRelays,
    p2p: { ...defaults.p2p, ...stored.p2p },
    wallet: { ...defaults.wallet, ...stored.wallet }
  };
}

function chooseArray<T>(value: T[] | undefined, fallback: T[]): T[] {
  if (!value || value.length === 0) return fallback;
  return value;
}
