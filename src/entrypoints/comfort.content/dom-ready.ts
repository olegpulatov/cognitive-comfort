export function scheduleWhenBodyReady(start: () => void): (() => void) | null {
  if (document.body) {
    start();
    return null;
  }

  let pending = true;
  const handleReady = (): void => {
    if (!pending) return;
    pending = false;
    start();
  };

  document.addEventListener('DOMContentLoaded', handleReady, { once: true });
  return () => {
    if (!pending) return;
    pending = false;
    document.removeEventListener('DOMContentLoaded', handleReady);
  };
}
