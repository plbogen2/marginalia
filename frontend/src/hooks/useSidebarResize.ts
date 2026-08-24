import { useState, useRef, useCallback, useEffect } from 'react';

export function useSidebarResize(initialWidth = 250, minWidth = 150, maxWidth = 600) {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth);
  const isResizing = useRef(false);

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    isResizing.current = true;
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing.current) {
      const newWidth = Math.max(minWidth, Math.min(maxWidth, mouseMoveEvent.clientX));
      setSidebarWidth(newWidth);
    }
  }, [minWidth, maxWidth]);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  return {
    sidebarWidth,
    setSidebarWidth,
    startResizing
  };
}
