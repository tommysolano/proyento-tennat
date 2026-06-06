import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function HashScroll() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  }, [hash, pathname]);

  return null;
}
