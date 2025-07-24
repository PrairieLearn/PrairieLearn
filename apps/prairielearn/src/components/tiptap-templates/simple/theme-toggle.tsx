/* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
import * as React from 'react';

import { Button } from '#components/tiptap-ui-primitive/button/index.js';

export function ThemeToggle() {
  const [isDarkMode, setIsDarkMode] = React.useState<boolean>(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setIsDarkMode(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  React.useEffect(() => {
    const initialDarkMode =
      !!document.querySelector('meta[name="color-scheme"][content="dark"]') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDarkMode(initialDarkMode);
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((isDark) => !isDark);

  return (
    <Button
      aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
      data-style="ghost"
      onClick={toggleDarkMode}
    >
      {isDarkMode ? <i class="bi bi-moon" /> : <i class="bi bi-brightness-high" />}
    </Button>
  );
}
