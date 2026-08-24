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
    } catch (err) {
      console.error('Failed to fetch git status:', err);
      setGitStatus('');
      setHasRemote(false);
      setGitAhead(0);
      setHasGemini(false);
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
    fetchGitStatus,
    fetchGitBranch,
    handleRefresh,
    handleCommit,
    handlePush,
    handlePull
  };
}
