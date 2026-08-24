import { useState, useEffect, useCallback } from 'react';

export interface AuthInfo {
  loggedIn: boolean;
  user: string | null;
  isOAuthMode: boolean;
  isAdmin?: boolean;
}

export function useAuth() {
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
  useEffect(() => {
    let initialBuildTime: number | null = null;

    const checkServerVersion = async () => {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.buildTime === 'number') {
          if (initialBuildTime === null) {
            initialBuildTime = data.buildTime;
          } else if (data.buildTime !== initialBuildTime) {
            console.log('New server deployment detected. Reloading application...');
            window.location.reload();
          }
        }
      } catch (err) {
        // Ignore temporary network errors during server restart
      }
    };

    checkServerVersion();
    const interval = setInterval(checkServerVersion, 20000);
    return () => clearInterval(interval);
  }, []);

  return {
    authInfo,
    fetchAuthStatus,
    handleLogout
  };
}
