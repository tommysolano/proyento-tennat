import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function HashScroll() {
  const { hash, pathname, search } = useLocation();

  useEffect(() => {
    if (!hash) {
      const main = document.getElementById('main-content');
      if (main) {
        main.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  }, [hash, pathname, search]);

  return null;
}
