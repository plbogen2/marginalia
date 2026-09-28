import { useState, useEffect, useCallback, useRef } from 'react';

export interface AuthInfo {
  loggedIn: boolean;
  user: string | null;
  isOAuthMode: boolean;
  isAdmin?: boolean;
}

export function useAuth(onBeforeReload?: () => Promise<void> | void) {
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);

  const fetchAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setAuthInfo(data);
    } catch (err) {
      console.error('Failed to fetch auth status:', err);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to log out:', err);
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    fetchAuthStatus();
  }, [fetchAuthStatus]);

  // Server Update Auto-Reload Detection
  const initialBuildTimeRef = useRef<number | null>(null);
  const onBeforeReloadRef = useRef(onBeforeReload);
  onBeforeReloadRef.current = onBeforeReload;

  useEffect(() => {
    const checkServerVersion = async () => {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.buildTime === 'number') {
          if (initialBuildTimeRef.current === null) {
            initialBuildTimeRef.current = data.buildTime;
          } else if (data.buildTime !== initialBuildTimeRef.current) {
            console.log('New server deployment detected. Flushing active buffer before reload...');
            initialBuildTimeRef.current = data.buildTime;

            // Trigger any registered buffer flush callbacks before reload
            if (onBeforeReloadRef.current) {
              try {
                await onBeforeReloadRef.current();
              } catch (e) {
                console.warn('Failed to flush buffer before reload:', e);
              }
            }

            window.location.reload();
          }
        }
      } catch (err) {
        // Ignore temporary network errors during server restart
      }
    };

    checkServerVersion();
    const interval = setInterval(checkServerVersion, 30000);
    return () => clearInterval(interval);
  }, []);

  return {
    authInfo,
    fetchAuthStatus,
    handleLogout
  };
}
