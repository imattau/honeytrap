import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppSettings } from '../../storage/types';
import { SettingsStore } from '../../storage/settings';

export function useSettingsState(defaultSettings: AppSettings, onUpdate?: (next: AppSettings) => void) {
  const [settings, setSettingsState] = useState<AppSettings>(defaultSettings);
  const settingsStore = useMemo(() => new SettingsStore(defaultSettings), [defaultSettings]);

  useEffect(() => {
    settingsStore.load().then(setSettingsState);
  }, [settingsStore]);

  const updateSettings = useCallback((next: AppSettings) => {
    setSettingsState(next);
    settingsStore.save(next).catch(() => null);
    if (onUpdate) onUpdate(next);
  }, [onUpdate, settingsStore]);

  return { settings, updateSettings, settingsStore };
}
