import { useEffect, useState } from 'react';
import type { ThemeMode } from '../domain';

function readStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem('app_theme');
    return stored === 'LIGHT' || stored === 'DARK' ? stored : 'SYSTEM';
  } catch {
    return 'SYSTEM';
  }
}

function applyAppTheme(theme: ThemeMode): void {
  const isDark = theme === 'DARK' || (theme === 'SYSTEM' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', Boolean(isDark));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0B1528' : '#0D2B52');
}

/** Thème clair, sombre ou automatique, mémorisé sur l'appareil. */
export function useTheme() {
  const [appTheme, setAppTheme] = useState<ThemeMode>(readStoredTheme);

  const handleChangeTheme = (newTheme: ThemeMode) => {
    setAppTheme(newTheme);
    try {
      localStorage.setItem('app_theme', newTheme);
    } catch {
      // Préférence non mémorisée : le thème reste appliqué pour cette visite.
    }
  };

  const handleCycleTheme = () => {
    handleChangeTheme(appTheme === 'LIGHT' ? 'DARK' : appTheme === 'DARK' ? 'SYSTEM' : 'LIGHT');
  };

  useEffect(() => {
    applyAppTheme(appTheme);
    if (appTheme !== 'SYSTEM' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyAppTheme('SYSTEM');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [appTheme]);

  return { appTheme, handleChangeTheme, handleCycleTheme };
}

export type ThemeControls = ReturnType<typeof useTheme>;
