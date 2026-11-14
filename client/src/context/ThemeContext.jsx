import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const ThemeContext = createContext(null);
export function ThemeProvider({ children }) {
  const { pathname } = useLocation();
  useEffect(() => { document.documentElement.dataset.home = String(pathname === '/home'); }, [pathname]);
  const [theme, setTheme] = useState(() => {
    try { return ['light', 'dark', 'system'].includes(localStorage.getItem('truehive-theme')) ? localStorage.getItem('truehive-theme') : 'system'; }
    catch { return 'system'; }
  });
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    try { localStorage.setItem('truehive-theme', theme); } catch { /* Storage may be disabled. */ }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
