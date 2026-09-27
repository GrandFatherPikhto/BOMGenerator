import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { api } from './lib/apiClient.js';

/** Container widths for the three page-width options. */
export const PAGE_WIDTH = {
  normal: 1536,
  wide: 1920,
  full: '100%',
};

const SettingsContext = createContext({
  settings: null,
  setSettings: () => {},
  reload: () => {},
});

/**
 * Loads the settings singleton once and shares it with the whole app, so the
 * page width (and other settings) apply immediately after saving.
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);

  const reload = useCallback(async () => {
    try {
      setSettings(await api.settings.get());
    } catch {
      // The app still renders with built-in defaults if settings are unavailable.
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <SettingsContext.Provider value={{ settings, setSettings, reload }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
