import { useState, useCallback, useRef } from 'react';

interface UseGitProps {
  setLoading: (loading: boolean) => void;
  fetchFiles: () => Promise<void>;
  activeFile: string | null;
  setEditorValue: (val: string) => void;
  setOriginalContent: (val: string) => void;
}

export function useGit({
  setLoading,
  fetchFiles,
  activeFile,
  setEditorValue,
  setOriginalContent
}: UseGitProps) {
  const [gitStatus, setGitStatus] = useState('');
  const [gitBranch, setGitBranch] = useState('');
  const [hasRemote, setHasRemote] = useState(false);
  const [gitAhead, setGitAhead] = useState(0);
  const [hasGemini, setHasGemini] = useState(false);
  const [inConflict, setInConflict] = useState(false);
  const [conflictedFiles, setConflictedFiles] = useState<string[]>([]);

  const setLoadingRef = useRef(setLoading);
  setLoadingRef.current = setLoading;

  const fetchFilesRef = useRef(fetchFiles);
  fetchFilesRef.current = fetchFiles;

  const setEditorValueRef = useRef(setEditorValue);
  setEditorValueRef.current = setEditorValue;

  const setOriginalContentRef = useRef(setOriginalContent);
  setOriginalContentRef.current = setOriginalContent;

  const fetchGitStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/git/status');
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setGitStatus(data.status || '');
      setHasRemote(!!data.hasRemote);
      setGitAhead(data.ahead || 0);
      setHasGemini(!!data.hasGemini);
      setInConflict(!!data.inConflict);
      setConflictedFiles(data.conflictedFiles || []);
    } catch (err) {
      console.error('Failed to fetch git status:', err);
      setGitStatus('');
      setHasRemote(false);
      setGitAhead(0);
      setHasGemini(false);
      setInConflict(false);
      setConflictedFiles([]);
    }
  }, []);

  const fetchGitBranch = useCallback(async () => {
    try {
      const res = await fetch('/api/git/branch');
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setGitBranch(data.branch || '');
    } catch (err) {
      console.error('Failed to fetch git branch:', err);
      setGitBranch('unknown');
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (fetchFilesRef.current) fetchFilesRef.current();
    fetchGitStatus();
    fetchGitBranch();
  }, [fetchGitStatus, fetchGitBranch]);

  const handleCommit = useCallback(async (message: string) => {
    setLoadingRef.current(true);
    try {
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await res.json();
      alert(`Committed: ${data.result}`);
      await fetchGitStatus();
    } catch (err) {
      console.error('Failed to commit:', err);
      alert(`Commit failed: ${(err as Error).message}`);
    } finally {
      setLoadingRef.current(false);
    }
  }, [fetchGitStatus]);

  const handlePush = useCallback(async () => {
    setLoadingRef.current(true);
    try {
      const res = await fetch('/api/git/push', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Push failed');
      }
      alert('Successfully pushed changes to GitHub.');
      await fetchGitStatus();
    } catch (err) {
      console.error('Failed to push:', err);
      let msg = (err as Error).message;
      if (msg.includes('rejected') || msg.includes('fetch first')) {
        msg = 'The remote contains changes that you do not have locally. Please pull first.';
      }
      alert(`Push failed: ${msg}`);
    } finally {
      setLoadingRef.current(false);
    }
  }, [fetchGitStatus]);

  const handlePull = useCallback(async () => {
    setLoadingRef.current(true);
    try {
      const res = await fetch('/api/git/pull', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Pull failed');
      }
      alert('Successfully pulled changes from GitHub.');
      if (fetchFilesRef.current) {
        await fetchFilesRef.current();
      }
      await fetchGitStatus();
      if (activeFile) {
        const activeRes = await fetch(`/api/file?path=${encodeURIComponent(activeFile)}`);
        const activeData = await activeRes.json();
        setEditorValueRef.current(activeData.content);
        setOriginalContentRef.current(activeData.content);
      }
    } catch (err) {
      console.error('Failed to pull:', err);
      let msg = (err as Error).message;
      if (msg.includes('unstaged changes') || msg.includes('locally modified files')) {
        msg = 'You have unstaged changes that would be overwritten by pull. Please commit or stash them first.';
      }
      alert(`Pull failed: ${msg}`);
      await fetchGitStatus();
    } finally {
      setLoadingRef.current(false);
    }
  }, [activeFile, fetchGitStatus]);

  const handleAbortMerge = useCallback(async () => {
    setLoadingRef.current(true);
    try {
      const res = await fetch('/api/git/abort-merge', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to abort merge');
      }
      alert('Merge aborted. Repository restored to clean state.');
      if (fetchFilesRef.current) {
        await fetchFilesRef.current();
      }
      await fetchGitStatus();
      if (activeFile) {
        const activeRes = await fetch(`/api/file?path=${encodeURIComponent(activeFile)}`);
        if (activeRes.ok) {
          const activeData = await activeRes.json();
          setEditorValueRef.current(activeData.content);
          setOriginalContentRef.current(activeData.content);
        }
      }
    } catch (err) {
      console.error('Failed to abort merge:', err);
      alert(`Abort merge failed: ${(err as Error).message}`);
    } finally {
      setLoadingRef.current(false);
    }
  }, [activeFile, fetchGitStatus]);

  const handleResolveFile = useCallback(async (filePath: string, resolvedContent?: string) => {
    setLoadingRef.current(true);
    try {
      if (resolvedContent !== undefined) {
        const saveRes = await fetch('/api/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, content: resolvedContent })
        });
        if (!saveRes.ok) {
          const errData = await saveRes.json();
          throw new Error(errData.error || 'Failed to save resolved content');
        }
        if (activeFile === filePath) {
          setEditorValueRef.current(resolvedContent);
          setOriginalContentRef.current(resolvedContent);
        }
      }

      const res = await fetch('/api/git/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to mark file as resolved');
      }

      if (fetchFilesRef.current) {
        await fetchFilesRef.current();
      }
      await fetchGitStatus();
    } catch (err) {
      console.error('Failed to resolve file:', err);
      alert(`Resolution failed: ${(err as Error).message}`);
    } finally {
      setLoadingRef.current(false);
    }
  }, [activeFile, fetchGitStatus]);

  return {
    gitStatus,
    gitBranch,
    hasRemote,
    gitAhead,
    hasGemini,
    inConflict,
    conflictedFiles,
    fetchGitStatus,
    fetchGitBranch,
    handleRefresh,
    handleCommit,
    handlePush,
    handlePull,
    handleAbortMerge,
    handleResolveFile
  };
}
