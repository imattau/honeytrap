import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppSettings } from '../../storage/types';
import { SettingsStore } from '../../storage/settings';

export function useSettingsState(defaultSettings: AppSettings, onUpdate?: (next: AppSettings) => void) {
  const [settings, setSettingsState] = useState<AppSettings>(defaultSettings);
  const settingsStore = useMemo(() => new SettingsStore(defaultSettings), [defaultSettings]);

  useEffect(() => {
    settingsStore.load().then(setSettingsState);
  }, [settingsStore]);

  const updateSettings = useCallback((next: AppSettings | ((prev: AppSettings) => AppSettings)) => {
    setSettingsState((prev) => {
      const updated = typeof next === 'function' ? next(prev) : next;
      settingsStore.save(updated).catch(() => null);
      if (onUpdate) onUpdate(updated);
      return updated;
    });
  }, [onUpdate, settingsStore]);

  return { settings, updateSettings, settingsStore };
}
