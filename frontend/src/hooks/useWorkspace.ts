import { useState, useEffect, useCallback, useRef } from 'react';
import { resolveRelativePath } from '../utils/pathResolver';
import type { AuthInfo } from './useAuth';

interface UseWorkspaceProps {
  authInfo: AuthInfo | null;
  activeFile: string | null;
  setActiveFile: (file: string | null) => void;
  setLoading: (loading: boolean) => void;
  onWorkspaceOrFilesRefreshed?: () => Promise<void>;
}

export function useWorkspace({
  authInfo,
  activeFile,
  setActiveFile,
  setLoading,
  onWorkspaceOrFilesRefreshed
}: UseWorkspaceProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [activeWorkspaceName, setActiveWorkspaceName] = useState<string | null>(null);

  // Use refs for callbacks to prevent unnecessary recreation of callbacks and infinite render loops
  const onRefreshedRef = useRef(onWorkspaceOrFilesRefreshed);
  onRefreshedRef.current = onWorkspaceOrFilesRefreshed;

  const setLoadingRef = useRef(setLoading);
  setLoadingRef.current = setLoading;

  const setActiveFileRef = useRef(setActiveFile);
  setActiveFileRef.current = setActiveFile;

  const initializedRef = useRef(false);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/files');
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (Array.isArray(data)) {
        setFiles(data);
      } else {
        throw new Error('Received invalid files data');
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
      setFiles([]);
    }
  }, []);

  const loadDefaultWorkspace = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces');
      const data = await res.json();
      if (data.activeName) {
        setActiveWorkspaceName(data.activeName);
        window.history.replaceState(null, '', `/${encodeURIComponent(data.activeName)}/`);
        await fetchFiles();
        if (onRefreshedRef.current) {
          await onRefreshedRef.current();
        }
        setActiveFileRef.current(null);
      }
    } catch (err) {
      console.error('Failed to load default workspace:', err);
    }
  }, [fetchFiles]);

  const initWorkspaceAndLoad = useCallback(async () => {
    setLoadingRef.current(true);
    try {
      const pathSegments = window.location.pathname.split('/').filter(Boolean);
      let workspaceName = '';
      let filePath: string | null = null;

      if (pathSegments.length >= 1) {
        workspaceName = decodeURIComponent(pathSegments[0]);
        if (pathSegments.length >= 2) {
          filePath = pathSegments.slice(1).map(decodeURIComponent).join('/');
        }
      }

      if (workspaceName) {
        const res = await fetch('/api/workspaces/select-by-name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: workspaceName })
        });

        if (res.ok) {
          const data = await res.json();
          setActiveWorkspaceName(data.name);
          await fetchFiles();
          if (onRefreshedRef.current) {
            await onRefreshedRef.current();
          }
          if (filePath) {
            setActiveFileRef.current(filePath);
          }
        } else {
          console.warn(`Workspace not found: ${workspaceName}, falling back to default`);
          await loadDefaultWorkspace();
        }
      } else {
        await loadDefaultWorkspace();
      }
    } catch (err) {
      console.error('Initialization failed:', err);
    } finally {
      setLoadingRef.current(false);
    }
  }, [fetchFiles, loadDefaultWorkspace]);

  useEffect(() => {
    if (authInfo && authInfo.loggedIn && !initializedRef.current) {
      initializedRef.current = true;
      initWorkspaceAndLoad();
    } else if (!authInfo || !authInfo.loggedIn) {
      initializedRef.current = false;
    }
  }, [authInfo?.loggedIn, initWorkspaceAndLoad]);

  useEffect(() => {
    const handlePopState = async () => {
      const fullPath = decodeURIComponent(window.location.pathname.slice(1));
      const parts = fullPath.split('/');
      if (parts.length >= 1) {
        const wsName = parts[0];
        const filePath = parts.slice(1).join('/');

        if (wsName !== activeWorkspaceName) {
          setLoadingRef.current(true);
          try {
            const res = await fetch('/api/workspaces/select-by-name', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: wsName })
            });
            if (res.ok) {
              const data = await res.json();
              setActiveWorkspaceName(data.name);
              await fetchFiles();
              if (onRefreshedRef.current) {
                await onRefreshedRef.current();
              }
              setActiveFileRef.current(filePath || null);
            }
          } catch (err) {
            console.error(err);
          } finally {
            setLoadingRef.current(false);
          }
        } else {
          setActiveFileRef.current(filePath || null);
        }
      } else {
        setActiveFileRef.current(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeWorkspaceName, fetchFiles]);

  const selectFile = useCallback((filePath: string | null) => {
    setActiveFileRef.current(filePath);
    let newUrl = '/';
    if (activeWorkspaceName) {
      newUrl += encodeURIComponent(activeWorkspaceName) + '/';
    }
    if (filePath) {
      newUrl += filePath.split('/').map(encodeURIComponent).join('/');
    }

    const currentPath = decodeURIComponent(window.location.pathname.slice(1));
    const targetPath = (activeWorkspaceName ? activeWorkspaceName + '/' : '') + (filePath || '');
    if (currentPath !== targetPath) {
      window.history.pushState(null, '', newUrl);
    }
  }, [activeWorkspaceName]);

  const handleNavigateLink = useCallback((href: string) => {
    if (!activeFile) return;
    const resolved = resolveRelativePath(activeFile, href);
    if (files.includes(resolved)) {
      selectFile(resolved);
    } else {
      console.warn(`File not found in workspace: ${resolved}`);
      alert(`Linked file not found: ${resolved}`);
    }
  }, [activeFile, files, selectFile]);

  return {
    files,
    setFiles,
    fetchFiles,
    activeWorkspaceName,
    setActiveWorkspaceName,
    selectFile,
    handleNavigateLink,
    loadDefaultWorkspace
  };
}
