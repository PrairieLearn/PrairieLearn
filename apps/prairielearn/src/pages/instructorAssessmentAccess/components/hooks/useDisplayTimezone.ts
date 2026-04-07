import { createContext, use } from 'react';

const DisplayTimezoneContext = createContext<string | null>(null);

export const DisplayTimezoneProvider = DisplayTimezoneContext.Provider;

export function useDisplayTimezone(): string {
  const value = use(DisplayTimezoneContext);
  if (value === null) {
    throw new Error('useDisplayTimezone must be used within a DisplayTimezoneProvider');
  }
  return value;
}
