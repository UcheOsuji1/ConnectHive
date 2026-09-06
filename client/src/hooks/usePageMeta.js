import { useEffect } from 'react';

export default function usePageMeta(title, description) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title ? `${title} — TrueHive` : 'TrueHive';

    const tag = document.querySelector('meta[name="description"]');
    const prevContent = tag ? tag.getAttribute('content') : '';
    if (tag && description) tag.setAttribute('content', description);

    return () => {
      document.title = prevTitle;
      if (tag) tag.setAttribute('content', prevContent);
    };
  }, [title, description]);
}
