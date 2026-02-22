import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useSettingsState } from '../useSettingsState';
import { defaultSettings } from '../../../storage/defaults';
import type { AppSettings } from '../../../storage/types';

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (next: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  setFeedMode: (mode: AppSettings['feedMode']) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { settings, updateSettings } = useSettingsState(defaultSettings);

  const setFeedMode = useCallback((mode: AppSettings['feedMode']) => {
    updateSettings((prev: AppSettings) => ({ ...prev, feedMode: mode }));
  }, [updateSettings]);

  const value = useMemo(() => ({
    settings,
    updateSettings,
    setFeedMode
  }), [settings, updateSettings, setFeedMode]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
}
