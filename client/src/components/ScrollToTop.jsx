import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    if (navType === 'POP') return;   // back / forward — let the browser restore
    if (hash) return;                // anchor link — let it scroll to its target

    // globals.css sets `html { scroll-behavior: smooth }`, which would animate
    // this jump. Suppress it for the reset, then restore.
    const root = document.documentElement;
    const prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    root.style.scrollBehavior = prev;
  }, [pathname, hash, navType]);

  return null;
}
